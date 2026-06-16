import os
import socket
import time
from contextlib import contextmanager
from typing import Any, Iterator

from app.models.router import Router
from app.core.config import settings
from app.services.routers.credentials import decrypt_secret

try:
    import routeros_api
except ImportError:  # pragma: no cover - handled at runtime when dependency is missing
    routeros_api = None


DEFAULT_ROUTER_HOST = os.getenv("ROUTER_HOST", "23.92.30.38")
DEFAULT_ROUTER_PORT = int(os.getenv("ROUTER_PORT", "10269"))
DEFAULT_ROUTER_USER = os.getenv("ROUTER_USER", "admin")
DEFAULT_ROUTER_PASS = os.getenv("ROUTER_PASS", "admin")


def router_defaults() -> dict[str, Any]:
    return {
        "host": DEFAULT_ROUTER_HOST,
        "port": DEFAULT_ROUTER_PORT,
        "username": DEFAULT_ROUTER_USER,
        "password": DEFAULT_ROUTER_PASS,
    }


class RouterApiSession:
    """A RouterOS API connection that survives individual broken-socket errors.

    Use as a context manager.  After catching an ``OSError`` (e.g. '[Errno 9]
    Bad file descriptor' left by a timed-out ``/tool fetch``), call
    ``reconnect()`` to get a fresh socket and continue the loop without
    tearing down the whole ``with`` block.
    """

    def __init__(self, router: Router, socket_timeout: float | None = None) -> None:
        self._router = router
        self._socket_timeout = socket_timeout
        self._pool: Any | None = None
        self.api: Any | None = None

    def connect(self) -> None:
        self._close()
        if routeros_api is None:
            raise RuntimeError("routeros-api is not installed")
        pool = routeros_api.RouterOsApiPool(
            self._router.host,
            username=self._router.username,
            password=decrypt_secret(self._router.password),
            port=self._router.port,
            plaintext_login=self._router.plaintext_login,
        )
        if self._socket_timeout is not None:
            pool.socket_timeout = self._socket_timeout
        self._pool = pool
        self.api = pool.get_api()

    def reconnect(self) -> None:
        """Replace a broken socket with a fresh connection."""
        self.connect()

    def _close(self) -> None:
        if self._pool is not None:
            try:
                self._pool.disconnect()
            except Exception:
                pass
            self._pool = None
            self.api = None

    def __enter__(self) -> "RouterApiSession":
        self.connect()
        return self

    def __exit__(self, *_: Any) -> None:
        self._close()


@contextmanager
def router_connection(router: Router, socket_timeout: float | None = None) -> Iterator[Any]:
    if routeros_api is None:
        raise RuntimeError("routeros-api is not installed")

    connection = routeros_api.RouterOsApiPool(
        router.host,
        username=router.username,
        password=decrypt_secret(router.password),
        port=router.port,
        plaintext_login=router.plaintext_login,
    )
    if socket_timeout is not None:
        # Must be set before get_api() opens the socket — routeros_api reads
        # this value when creating the connection, not on every call.
        connection.socket_timeout = socket_timeout
    try:
        yield connection.get_api()
    finally:
        connection.disconnect()


def _resource_list(api: Any, path: str) -> list[dict[str, Any]]:
    return [dict(item) for item in api.get_resource(path).get()]


def _safe_resource_list(api: Any, path: str) -> dict[str, Any]:
    try:
        return {"items": _resource_list(api, path), "error": None}
    except Exception as exc:
        return {"items": [], "error": str(exc)}


def enable_snmp(router: Router) -> None:
    """Enable restricted SNMP v2c monitoring and its tunnel firewall rule."""
    with router_connection(router) as api:
        snmp = api.get_resource("/snmp")
        snmp.set(enabled="yes")

        communities = api.get_resource("/snmp/community")
        allowed_address = settings.chr_tunnel_local_address
        if "/" not in allowed_address:
            allowed_address = f"{allowed_address}/32"
        community_params = {
            "name": settings.snmp_community,
            "addresses": allowed_address,
            "read-access": "yes",
            "write-access": "no",
        }
        # Search all communities by name to handle default entries that may not
        # be returned when filtering by name via the API.
        all_communities = communities.get()
        matches = [c for c in all_communities if c.get("name") == settings.snmp_community]
        if matches and matches[0].get("id"):
            communities.set(id=matches[0]["id"], **community_params)
        else:
            try:
                communities.add(**community_params)
            except Exception as add_err:
                if "already exists" in str(add_err).lower():
                    # Community exists but wasn't found by name filter; refresh and update.
                    all_communities = communities.get()
                    matches = [c for c in all_communities if c.get("name") == settings.snmp_community]
                    if matches and matches[0].get("id"):
                        communities.set(id=matches[0]["id"], **community_params)
                else:
                    raise

        filters = api.get_resource("/ip/firewall/filter")
        comment = "Tresa: allow SNMP monitoring"
        rules = filters.get(comment=comment)

        all_interfaces = api.get_resource("/interface").get()
        tunnel_exists = any(i.get("name") == "tresa-tunnel" for i in all_interfaces)
        tunnel_list_exists = bool(api.get_resource("/interface/list").get(name="TresaTunnel"))

        rule_params: dict[str, str] = {
            "chain": "input",
            "protocol": "udp",
            "dst-port": str(settings.snmp_port),
            "action": "accept",
            "comment": comment,
        }
        if tunnel_list_exists:
            # Router was provisioned with the SSTP fallover script — match
            # either tunnel transport via the shared interface list.
            rule_params["in-interface-list"] = "TresaTunnel"
        elif tunnel_exists:
            rule_params["in-interface"] = "tresa-tunnel"
        else:
            # Tunnel not provisioned yet; restrict by source address instead.
            src = settings.chr_tunnel_local_address.split("/")[0]
            rule_params["src-address"] = src

        if rules and rules[0].get("id"):
            filters.set(id=rules[0]["id"], **rule_params)
        else:
            filters.add(**rule_params)


def get_router_status(router: Router) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            system_resources = _resource_list(api, "/system/resource")
            return {
                "connected": True,
                "system_resource": system_resources[0] if system_resources else None,
                "interfaces": _resource_list(api, "/interface"),
                "ip_addresses": _resource_list(api, "/ip/address"),
                "dhcp_leases": _resource_list(api, "/ip/dhcp-server/lease"),
                "error": None,
            }
    except Exception as exc:
        return {
            "connected": False,
            "system_resource": None,
            "interfaces": [],
            "ip_addresses": [],
            "dhcp_leases": [],
            "error": str(exc),
        }


def get_router_features(router: Router) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            features = {
                "system_resource": _safe_resource_list(api, "/system/resource"),
                "interfaces": _safe_resource_list(api, "/interface"),
                "ip_addresses": _safe_resource_list(api, "/ip/address"),
                "dhcp_leases": _safe_resource_list(api, "/ip/dhcp-server/lease"),
                "dhcp_servers": _safe_resource_list(api, "/ip/dhcp-server"),
                "routes": _safe_resource_list(api, "/ip/route"),
                "firewall_filters": _safe_resource_list(api, "/ip/firewall/filter"),
                "hotspot_servers": _safe_resource_list(api, "/ip/hotspot"),
                "ppp_secrets": _safe_resource_list(api, "/ppp/secret"),
            }
            return {"connected": True, "features": features, "error": None}
    except Exception as exc:
        return {"connected": False, "features": {}, "error": str(exc)}


def get_active_hotspot_users(router: Router) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            active_users = _resource_list(api, "/ip/hotspot/active")
            return {
                "connected": True,
                "count": len(active_users),
                "active_users": active_users,
                "error": None,
            }
    except Exception as exc:
        return {
            "connected": False,
            "count": 0,
            "active_users": [],
            "error": str(exc),
        }


def get_hotspot_vouchers(router: Router) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            vouchers = _resource_list(api, "/ip/hotspot/user")
            profiles = _safe_resource_list(api, "/ip/hotspot/user/profile")
            return {
                "connected": True,
                "count": len(vouchers),
                "vouchers": vouchers,
                "profiles": profiles["items"],
                "profiles_error": profiles["error"],
                "error": None,
            }
    except Exception as exc:
        return {
            "connected": False,
            "count": 0,
            "vouchers": [],
            "profiles": [],
            "profiles_error": None,
            "error": str(exc),
        }


def get_router_logs(router: Router, limit: int = 200) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            logs = _resource_list(api, "/log")
            return {
                "connected": True,
                "logs": logs[-limit:],
                "error": None,
            }
    except Exception as exc:
        return {
            "connected": False,
            "logs": [],
            "error": str(exc),
        }


def ping_tcp(host: str, port: int, timeout_seconds: float = 3.0) -> dict[str, Any]:
    started_at = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
            return {
                "reachable": True,
                "host": host,
                "port": port,
                "latency_ms": latency_ms,
                "error": None,
            }
    except OSError as exc:
        return {
            "reachable": False,
            "host": host,
            "port": port,
            "latency_ms": None,
            "error": str(exc),
        }


def ping_from_router(router: Router, target: str, count: int = 4) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            replies = api.get_binary_resource("/").call(
                "ping",
                {"address": target, "count": str(count), "interval": "500ms"},
            )
        successful = [
            reply for reply in replies
            if str(reply.get("received", "0")) != "0" or reply.get("time")
        ]
        times: list[float] = []
        for reply in successful:
            raw_time = str(reply.get("time", "")).lower().replace("ms", "")
            try:
                times.append(float(raw_time))
            except ValueError:
                continue
        return {
            "reachable": bool(successful),
            "host": target,
            "port": None,
            "latency_ms": round(sum(times) / len(times), 2) if times else None,
            "error": None if successful else f"No ICMP replies from {target}",
        }
    except Exception as exc:
        return {
            "reachable": False,
            "host": target,
            "port": None,
            "latency_ms": None,
            "error": str(exc),
        }


def reboot_router(router: Router) -> dict[str, Any]:
    try:
        with router_connection(router) as api:
            api.get_binary_resource("/system").call("reboot")
        return {"success": True, "error": None}
    except Exception as exc:
        # RouterOS normally closes the API socket immediately after accepting reboot.
        message = str(exc).lower()
        if "closed" in message or "reset" in message or "eof" in message:
            return {"success": True, "error": None}
        return {"success": False, "error": str(exc)}


def test_connection(
    host: str,
    port: int,
    username: str,
    password: str,
    plaintext_login: bool = True,
) -> dict[str, Any]:
    """TCP ping + RouterOS API login test. Returns reachable/connected/identity."""
    ping = ping_tcp(host, port)
    if not ping["reachable"]:
        return {
            "reachable": False,
            "connected": False,
            "host": host,
            "port": port,
            "latency_ms": None,
            "system_identity": None,
            "error": ping["error"],
        }

    if routeros_api is None:
        return {
            "reachable": True,
            "connected": False,
            "host": host,
            "port": port,
            "latency_ms": ping["latency_ms"],
            "system_identity": None,
            "error": "routeros-api is not installed",
        }

    try:
        pool = routeros_api.RouterOsApiPool(
            host,
            username=username,
            password=password,
            port=port,
            plaintext_login=plaintext_login,
        )
        api = pool.get_api()
        identity = api.get_resource("/system/identity").get()
        identity_name = identity[0].get("name") if identity else None
        pool.disconnect()
        return {
            "reachable": True,
            "connected": True,
            "host": host,
            "port": port,
            "latency_ms": ping["latency_ms"],
            "system_identity": identity_name,
            "error": None,
        }
    except Exception as exc:
        return {
            "reachable": True,
            "connected": False,
            "host": host,
            "port": port,
            "latency_ms": ping["latency_ms"],
            "system_identity": None,
            "error": str(exc),
        }
