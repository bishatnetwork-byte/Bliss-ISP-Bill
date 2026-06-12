import hashlib
import hmac
import ipaddress
import json
import secrets
import threading
import time
import traceback as traceback_module
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator
from uuid import UUID

from sqlmodel import Session, select

from app.core.config import settings
from app.db.session import engine
from app.models.branch import Branch
from app.models.router import Router
from app.models.router_event import RouterAuditLog, RouterErrorLog
from app.services.notification import notify
from app.services.routers.credentials import decrypt_secret, encrypt_secret
from app.services.routers.events import router_event_hub
from app.services.routers.routeros import routeros_api


NAT_COMMENT_PREFIX = "customer:"
SNMP_NAT_COMMENT_PREFIX = "customer-snmp:"
WINBOX_NAT_COMMENT_PREFIX = "customer-winbox:"
SAFE_COMMANDS = {
    ("/system/resource", "print"),
    ("/system/identity", "print"),
    ("/interface", "print"),
    ("/ip/address", "print"),
    ("/ip/dhcp-server/lease", "print"),
    ("/ip/hotspot/active", "print"),
    ("/ip/hotspot/user", "print"),
    ("/log", "print"),
    ("/ping", "run"),
}
_rate_windows: dict[UUID, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()
_last_chr_error_log_at = 0.0
CHR_ERROR_LOG_INTERVAL_SECONDS = 15 * 60


def registration_token(router_id: UUID, issued_at: int | None = None) -> str:
    timestamp = issued_at or int(time.time())
    value = f"{router_id}.{timestamp}"
    signature = hmac.new(
        settings.router_registration_secret.encode(), value.encode(), hashlib.sha256
    ).hexdigest()
    return f"{value}.{signature}"


def verify_registration_token(token: str) -> UUID:
    try:
        value, issued_at_raw, signature = token.rsplit(".", 2)
        router_id = UUID(value)
        issued_at = int(issued_at_raw)
    except (ValueError, AttributeError) as exc:
        raise ValueError("Invalid router registration token") from exc
    expected = registration_token(router_id, issued_at).rsplit(".", 1)[1]
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid router registration token")
    if issued_at > int(time.time()) + 300 or int(time.time()) - issued_at > 48 * 60 * 60:
        raise ValueError("Router registration token has expired; generate a fresh script")
    return router_id


@contextmanager
def chr_connection() -> Iterator[Any]:
    if routeros_api is None:
        raise RuntimeError("routeros-api is not installed")
    if not settings.chr_api_password:
        raise RuntimeError("CHR_API_PASSWORD is not configured")
    last_error: Exception | None = None
    pool = None
    for attempt in range(3):
        try:
            pool = routeros_api.RouterOsApiPool(
                settings.chr_host,
                username=settings.chr_api_username,
                password=settings.chr_api_password,
                port=settings.chr_api_port,
                plaintext_login=settings.chr_plaintext_login,
            )
            api = pool.get_api()
            break
        except Exception as exc:
            last_error = exc
            if pool is not None:
                try:
                    pool.disconnect()
                except Exception:
                    pass
                pool = None
            if attempt < 2:
                time.sleep(5)
    else:
        raise RuntimeError(f"CHR API unavailable after 3 attempts: {last_error}")
    try:
        yield api
    finally:
        if pool is not None:
            pool.disconnect()


def _log_audit(session: Session, router: Router | None, event: str, details: Any = None) -> None:
    session.add(RouterAuditLog(
        router_id=router.id if router else None,
        event=event,
        details=json.dumps(details, default=str) if details is not None else None,
    ))
    session.commit()


def log_error(
    session: Session,
    operation: str,
    exc: BaseException,
    router: Router | None = None,
) -> None:
    session.add(RouterErrorLog(
        router_id=router.id if router else None,
        operation=operation,
        message=str(exc),
        traceback="".join(traceback_module.format_exception(type(exc), exc, exc.__traceback__)),
    ))
    session.commit()


def _owner_id(session: Session, router: Router) -> UUID | None:
    branch = session.get(Branch, router.branch_id)
    return branch.user_id if branch else None


def _publish(session: Session, router: Router, payload: dict[str, Any]) -> None:
    user_id = _owner_id(session, router)
    if user_id:
        router_event_hub.publish(user_id, payload)


def _allocate_nat_port(session: Session) -> int:
    used = set(session.exec(select(Router.nat_port).where(Router.nat_port.is_not(None))).all())
    used.update(session.exec(select(Router.winbox_nat_port).where(Router.winbox_nat_port.is_not(None))).all())
    used.update(session.exec(select(Router.port)).all())
    size = settings.router_nat_port_max - settings.router_nat_port_min + 1
    for _ in range(10):
        port = secrets.randbelow(size) + settings.router_nat_port_min
        if port not in used:
            return port
    raise RuntimeError("Could not allocate a unique NAT port after 10 attempts")


def _allocate_tunnel_ip(session: Session) -> str:
    used = {
        str(value)
        for value in session.exec(select(Router.tunnel_ip).where(Router.tunnel_ip.is_not(None))).all()
    }
    network = ipaddress.ip_network("10.0.0.0/16")
    for numeric in range(int(network.network_address) + 258, int(network.broadcast_address)):
        candidate = str(ipaddress.ip_address(numeric))
        if candidate not in used:
            return candidate
    raise RuntimeError("Tunnel subnet 10.0.0.0/16 is exhausted")


def _clean_mac(mac: str) -> str:
    clean = "".join(character for character in mac.upper() if character in "0123456789ABCDEF")
    if len(clean) != 12:
        raise ValueError("Router MAC address must contain 12 hexadecimal characters")
    return clean


def _resource_items(api: Any, path: str) -> list[dict[str, Any]]:
    return [dict(item) for item in api.get_resource(path).get()]


def _find_nat_rule(api: Any, router: Router) -> dict[str, Any] | None:
    rules = _resource_items(api, "/ip/firewall/nat")
    if router.nat_rule_id:
        match = next((rule for rule in rules if rule.get("id") == router.nat_rule_id), None)
        if match:
            return match
    comment = f"{NAT_COMMENT_PREFIX}{router.ppp_username}"
    return next((rule for rule in rules if rule.get("comment") == comment), None)


def _find_snmp_nat_rule(api: Any, router: Router) -> dict[str, Any] | None:
    rules = _resource_items(api, "/ip/firewall/nat")
    if router.snmp_nat_rule_id:
        match = next((rule for rule in rules if rule.get("id") == router.snmp_nat_rule_id), None)
        if match:
            return match
    comment = f"{SNMP_NAT_COMMENT_PREFIX}{router.ppp_username}"
    return next((rule for rule in rules if rule.get("comment") == comment), None)


def _create_nat_rule(api: Any, router: Router) -> str:
    resource = api.get_resource("/ip/firewall/nat")
    payload = {
        "chain": "dstnat",
        "dst-address": settings.chr_host,
        "dst-port": str(router.nat_port),
        "protocol": "tcp",
        "action": "dst-nat",
        "to-addresses": str(router.tunnel_ip),
        "to-ports": str(settings.router_api_internal_port),
        "comment": f"{NAT_COMMENT_PREFIX}{router.ppp_username}",
    }
    result = resource.call("add", payload)
    rule_id = result.done_message.get("ret")
    if not rule_id:
        match_keys = ("dst-port", "to-addresses", "to-ports", "comment")
        rules = _resource_items(api, "/ip/firewall/nat")
        match = next(
            (rule for rule in rules if all(str(rule.get(key, "")) == payload[key] for key in match_keys)),
            None,
        )
        rule_id = match.get("id") if match else None
    if not rule_id:
        raise RuntimeError("CHR created the NAT rule but did not return its id")
    return str(rule_id)


def _find_winbox_nat_rule(api: Any, router: Router) -> dict[str, Any] | None:
    rules = _resource_items(api, "/ip/firewall/nat")
    if router.winbox_nat_rule_id:
        match = next((rule for rule in rules if rule.get("id") == router.winbox_nat_rule_id), None)
        if match:
            return match
    comment = f"{WINBOX_NAT_COMMENT_PREFIX}{router.ppp_username}"
    return next((rule for rule in rules if rule.get("comment") == comment), None)


def _create_winbox_nat_rule(api: Any, router: Router) -> str:
    resource = api.get_resource("/ip/firewall/nat")
    payload = {
        "chain": "dstnat",
        "dst-address": settings.chr_host,
        "dst-port": str(router.winbox_nat_port),
        "protocol": "tcp",
        "action": "dst-nat",
        "to-addresses": str(router.tunnel_ip),
        "to-ports": str(settings.router_winbox_internal_port),
        "comment": f"{WINBOX_NAT_COMMENT_PREFIX}{router.ppp_username}",
    }
    result = resource.call("add", payload)
    rule_id = result.done_message.get("ret")
    if not rule_id:
        match_keys = ("dst-port", "to-addresses", "to-ports", "comment")
        rules = _resource_items(api, "/ip/firewall/nat")
        match = next(
            (rule for rule in rules if all(str(rule.get(key, "")) == payload[key] for key in match_keys)),
            None,
        )
        rule_id = match.get("id") if match else None
    if not rule_id:
        raise RuntimeError("CHR created the Winbox NAT rule but did not return its id")
    return str(rule_id)


def _create_snmp_nat_rule(api: Any, router: Router) -> str:
    resource = api.get_resource("/ip/firewall/nat")
    payload = {
        "chain": "dstnat",
        "dst-address": settings.chr_host,
        "dst-port": str(router.nat_port),
        "protocol": "udp",
        "action": "dst-nat",
        "to-addresses": str(router.tunnel_ip),
        "to-ports": str(settings.snmp_port),
        "comment": f"{SNMP_NAT_COMMENT_PREFIX}{router.ppp_username}",
    }
    result = resource.call("add", payload)
    rule_id = result.done_message.get("ret")
    if not rule_id:
        match_keys = ("dst-port", "to-addresses", "to-ports", "comment")
        rules = _resource_items(api, "/ip/firewall/nat")
        match = next(
            (rule for rule in rules if all(str(rule.get(key, "")) == payload[key] for key in match_keys)),
            None,
        )
        rule_id = match.get("id") if match else None
    if not rule_id:
        raise RuntimeError("CHR created the SNMP NAT rule but did not return its id")
    return str(rule_id)


def _remove_nat_rule(api: Any, router: Router) -> None:
    rule = _find_nat_rule(api, router)
    if rule and rule.get("id"):
        api.get_resource("/ip/firewall/nat").remove(id=rule["id"])
    snmp_rule = _find_snmp_nat_rule(api, router)
    if snmp_rule and snmp_rule.get("id"):
        api.get_resource("/ip/firewall/nat").remove(id=snmp_rule["id"])
    winbox_rule = _find_winbox_nat_rule(api, router)
    if winbox_rule and winbox_rule.get("id"):
        api.get_resource("/ip/firewall/nat").remove(id=winbox_rule["id"])
    router.nat_rule_id = None
    router.snmp_nat_rule_id = None
    router.winbox_nat_rule_id = None


def _ensure_nat_rule(session: Session, api: Any, router: Router) -> None:
    rule = _find_nat_rule(api, router)
    expected = {
        "dst-address": settings.chr_host,
        "dst-port": str(router.nat_port),
        "to-addresses": str(router.tunnel_ip),
        "to-ports": str(settings.router_api_internal_port),
    }
    if rule and all(str(rule.get(key, "")) == value for key, value in expected.items()):
        router.nat_rule_id = str(rule.get("id"))
    else:
        if rule and rule.get("id"):
            api.get_resource("/ip/firewall/nat").remove(id=rule["id"])
        router.nat_rule_id = _create_nat_rule(api, router)

    snmp_rule = _find_snmp_nat_rule(api, router)
    expected_snmp = {
        "dst-address": settings.chr_host,
        "dst-port": str(router.nat_port),
        "to-addresses": str(router.tunnel_ip),
        "to-ports": str(settings.snmp_port),
    }
    if snmp_rule and all(str(snmp_rule.get(key, "")) == value for key, value in expected_snmp.items()):
        router.snmp_nat_rule_id = str(snmp_rule.get("id"))
    else:
        if snmp_rule and snmp_rule.get("id"):
            api.get_resource("/ip/firewall/nat").remove(id=snmp_rule["id"])
        router.snmp_nat_rule_id = _create_snmp_nat_rule(api, router)

    if router.winbox_nat_port is None:
        router.winbox_nat_port = _allocate_nat_port(session)

    winbox_rule = _find_winbox_nat_rule(api, router)
    expected_winbox = {
        "dst-address": settings.chr_host,
        "dst-port": str(router.winbox_nat_port),
        "to-addresses": str(router.tunnel_ip),
        "to-ports": str(settings.router_winbox_internal_port),
    }
    if winbox_rule and all(str(winbox_rule.get(key, "")) == value for key, value in expected_winbox.items()):
        router.winbox_nat_rule_id = str(winbox_rule.get("id"))
    else:
        if winbox_rule and winbox_rule.get("id"):
            api.get_resource("/ip/firewall/nat").remove(id=winbox_rule["id"])
        router.winbox_nat_rule_id = _create_winbox_nat_rule(api, router)


def ensure_snmp_forwarding(session: Session, router: Router) -> Router:
    if not router.ppp_username or not router.tunnel_ip or router.nat_port is None:
        raise ValueError("Router tunnel provisioning must be completed before enabling SNMP")
    with chr_connection() as api:
        snmp_rule = _find_snmp_nat_rule(api, router)
        expected = {
            "dst-address": settings.chr_host,
            "dst-port": str(router.nat_port),
            "to-addresses": str(router.tunnel_ip),
            "to-ports": str(settings.snmp_port),
        }
        if snmp_rule and all(str(snmp_rule.get(key, "")) == value for key, value in expected.items()):
            router.snmp_nat_rule_id = str(snmp_rule.get("id"))
        else:
            if snmp_rule and snmp_rule.get("id"):
                api.get_resource("/ip/firewall/nat").remove(id=snmp_rule["id"])
            router.snmp_nat_rule_id = _create_snmp_nat_rule(api, router)
    router.updated_at = datetime.utcnow()
    session.add(router)
    session.commit()
    session.refresh(router)
    return router


def ensure_winbox_forwarding(session: Session, router: Router) -> Router:
    if not router.ppp_username or not router.tunnel_ip:
        raise ValueError("Router tunnel provisioning must be completed before enabling Winbox forwarding")
    with chr_connection() as api:
        if router.winbox_nat_port is None:
            router.winbox_nat_port = _allocate_nat_port(session)
        winbox_rule = _find_winbox_nat_rule(api, router)
        expected = {
            "dst-address": settings.chr_host,
            "dst-port": str(router.winbox_nat_port),
            "to-addresses": str(router.tunnel_ip),
            "to-ports": str(settings.router_winbox_internal_port),
        }
        if winbox_rule and all(str(winbox_rule.get(key, "")) == value for key, value in expected.items()):
            router.winbox_nat_rule_id = str(winbox_rule.get("id"))
        else:
            if winbox_rule and winbox_rule.get("id"):
                api.get_resource("/ip/firewall/nat").remove(id=winbox_rule["id"])
            router.winbox_nat_rule_id = _create_winbox_nat_rule(api, router)
    router.updated_at = datetime.utcnow()
    session.add(router)
    session.commit()
    session.refresh(router)
    return router


def register_router(
    session: Session,
    token: str,
    mac: str,
    model: str,
    version: str,
    serial: str,
) -> tuple[Router, dict[str, Any]]:
    router_id = verify_registration_token(token)
    router = session.get(Router, router_id)
    if not router:
        raise ValueError("Router registration target no longer exists")
    clean_mac = _clean_mac(mac)
    mac_address = ":".join(clean_mac[index:index + 2] for index in range(0, 12, 2))
    duplicate = session.exec(
        select(Router).where(Router.mac_address == mac_address).where(Router.id != router.id)
    ).first()
    if duplicate:
        raise ValueError("This physical router is already registered")

    already_registered = bool(router.ppp_username)
    if not already_registered:
        ppp_username = f"tresa-{clean_mac}"
        serial_fragment = "".join(character for character in serial if character.isalnum())[-4:] or clean_mac[-4:]
        ppp_password = f"tr-{clean_mac}-{serial_fragment}"
        tunnel_ip = _allocate_tunnel_ip(session)
        api_password = secrets.token_urlsafe(24)
        with chr_connection() as api:
            existing = api.get_resource("/ppp/secret").get(name=ppp_username)
            if not existing:
                api.get_resource("/ppp/secret").call("add", {
                    "name": ppp_username,
                    "password": ppp_password,
                    "service": "l2tp",
                    "local-address": settings.chr_tunnel_local_address,
                    "remote-address": tunnel_ip,
                    "comment": f"Tresa router {router.id}",
                })
        router.ppp_username = ppp_username
        router.ppp_password_encrypted = encrypt_secret(ppp_password)
        router.tunnel_ip = tunnel_ip
        router.api_username = "billingapi"
        router.api_password_encrypted = encrypt_secret(api_password)
        router.status = "registered"
    else:
        ppp_password = decrypt_secret(router.ppp_password_encrypted)
        api_password = decrypt_secret(router.api_password_encrypted)

    router.mac_address = mac_address
    router.model = model[:255]
    router.os_version = version[:255]
    router.host = settings.chr_host
    router.username = router.api_username or "billingapi"
    router.password = encrypt_secret(api_password)
    router.updated_at = datetime.utcnow()
    session.add(router)
    session.commit()
    session.refresh(router)
    _log_audit(session, router, "router_registered", {"already_registered": already_registered})
    return router, {
        "status": "already_registered" if already_registered else "success",
        "ppp_username": router.ppp_username,
        "ppp_password": ppp_password,
        "api_username": router.api_username,
        "api_password": api_password,
        "tunnel_ip": router.tunnel_ip,
    }


def save_router_credentials(
    session: Session,
    token: str,
    mac: str,
    api_user: str,
    api_pass: str,
) -> Router:
    router = session.get(Router, verify_registration_token(token))
    if not router or router.mac_address != ":".join(
        _clean_mac(mac)[index:index + 2] for index in range(0, 12, 2)
    ):
        raise ValueError("Router registration does not match this MAC address")
    router.api_username = api_user
    router.api_password_encrypted = encrypt_secret(api_pass)
    router.username = api_user
    router.password = encrypt_secret(api_pass)
    router.updated_at = datetime.utcnow()
    session.add(router)
    session.commit()
    _log_audit(session, router, "api_credentials_saved")
    return router


def provision_router(
    session: Session,
    router: Router,
    tunnel_ip: str | None = None,
    api: Any | None = None,
) -> Router:
    try:
        if tunnel_ip:
            router.tunnel_ip = tunnel_ip
        if not router.ppp_username or not router.tunnel_ip:
            raise ValueError("Router has not completed PPP registration")
        if router.nat_port is None:
            router.nat_port = _allocate_nat_port(session)
        if api is not None:
            _ensure_nat_rule(session, api, router)
        else:
            with chr_connection() as new_api:
                _ensure_nat_rule(session, new_api, router)
        now = datetime.utcnow()
        router.port = router.nat_port
        router.host = settings.chr_host
        router.status = "connected"
        router.connected_at = now
        router.disconnected_at = None
        router.updated_at = now
        session.add(router)
        session.commit()
        _log_audit(session, router, "router_connected", {"port": router.nat_port})
        _publish(session, router, {
            "event": "router_connected",
            "customer": router.ppp_username,
            "port": router.nat_port,
        })
        if router.snmp_configured and not router.snmp_nat_rule_id:
            try:
                ensure_snmp_forwarding(session, router)
            except Exception:
                pass
        return router
    except Exception as exc:
        router.status = "provisioning_failed"
        session.add(router)
        session.commit()
        log_error(session, "provision_router", exc, router)
        raise


def confirm_router(session: Session, token: str, mac: str) -> Router:
    router = session.get(Router, verify_registration_token(token))
    expected_mac = ":".join(_clean_mac(mac)[index:index + 2] for index in range(0, 12, 2))
    if not router or router.mac_address != expected_mac:
        raise ValueError("Router registration does not match this MAC address")
    with chr_connection() as api:
        active = api.get_resource("/ppp/active").get(name=router.ppp_username)
        if not active:
            raise RuntimeError("L2TP tunnel is not active on the CHR")
        tunnel_ip = str(active[0].get("address") or router.tunnel_ip)
        return provision_router(session, router, tunnel_ip, api=api)


def router_resource(router: Router) -> dict[str, Any]:
    from app.services.routers.routeros import router_connection

    with router_connection(router) as api:
        resources = _resource_items(api, "/system/resource")
    return resources[0] if resources else {}


def run_safe_command(router: Router, path: str, action: str, params: dict[str, str]) -> Any:
    if (path, action) not in SAFE_COMMANDS:
        raise ValueError("Command is not in the safe RouterOS allowlist")
    now = time.monotonic()
    with _rate_lock:
        window = _rate_windows[router.id]
        while window and now - window[0] >= 1:
            window.popleft()
        if len(window) >= 3:
            raise RuntimeError("Router API rate limit exceeded (max 3 calls per second)")
        window.append(now)
    from app.services.routers.routeros import router_connection

    with router_connection(router) as api:
        if action == "print":
            return [dict(item) for item in api.get_resource(path).get(**params)]
        return api.get_binary_resource("/").call("ping", params)


def delete_router_from_chr(session: Session, router: Router) -> None:
    with chr_connection() as api:
        _remove_nat_rule(api, router)
        if router.ppp_username:
            secrets_found = api.get_resource("/ppp/secret").get(name=router.ppp_username)
            for secret in secrets_found:
                if secret.get("id"):
                    api.get_resource("/ppp/secret").remove(id=secret["id"])
    _log_audit(session, router, "router_removed")


def _active_sessions(api: Any) -> dict[str, str]:
    sessions: dict[str, str] = {}
    for path in ("/interface/l2tp-server", "/ppp/active"):
        try:
            for item in _resource_items(api, path):
                name = str(item.get("name") or item.get("user") or "")
                address = str(item.get("address") or item.get("remote-address") or "")
                if name and (path == "/ppp/active" or str(item.get("running", "true")).lower() == "true"):
                    sessions[name] = address
        except Exception:
            if path == "/ppp/active":
                raise
    return sessions


def poll_tunnels() -> bool:
    global _last_chr_error_log_at
    with Session(engine) as session:
        try:
            with chr_connection() as api:
                sessions = _active_sessions(api)
            routers = session.exec(select(Router).where(Router.ppp_username.is_not(None))).all()
            known = {router.ppp_username for router in routers}
            for username in set(sessions) - known:
                _log_audit(session, None, "unknown_l2tp_session", {"ppp_username": username})
            for router in routers:
                if router.ppp_username in sessions:
                    changed_ip = sessions[router.ppp_username] or router.tunnel_ip
                    reconnecting = router.status in {"disconnected", "unreachable"}
                    if reconnecting and settings.concentrator_rotate_port_on_reconnect:
                        with chr_connection() as api:
                            _remove_nat_rule(api, router)
                        router.nat_port = _allocate_nat_port(session)
                    if router.status not in {"connected", "online"} or changed_ip != router.tunnel_ip:
                        provision_router(session, router, changed_ip)
                elif router.status in {"connected", "online", "unreachable"}:
                    router.status = "disconnected"
                    router.disconnected_at = datetime.utcnow()
                    if settings.concentrator_remove_nat_on_disconnect:
                        with chr_connection() as api:
                            _remove_nat_rule(api, router)
                    session.add(router)
                    session.commit()
                    _log_audit(session, router, "router_disconnected")
                    _publish(session, router, {
                        "event": "router_disconnected",
                        "customer": router.ppp_username,
                    })
            return True
        except Exception as exc:
            now = time.monotonic()
            if now - _last_chr_error_log_at >= CHR_ERROR_LOG_INTERVAL_SECONDS:
                log_error(session, "poll_tunnels", exc)
                _last_chr_error_log_at = now
            return False


def health_check() -> None:
    with Session(engine) as session:
        routers = session.exec(
            select(Router).where(Router.status.in_(["connected", "online", "unreachable"]))
        ).all()
        for router in routers:
            try:
                router_resource(router)
                router.status = "online"
                router.last_seen = datetime.utcnow()
            except Exception as exc:
                was_unreachable = router.status == "unreachable"
                router.status = "unreachable"
                if not was_unreachable:
                    user_id = _owner_id(session, router)
                    if user_id:
                        notify(
                            session,
                            user_id,
                            "router",
                            f"{router.name} is unreachable",
                            f"The L2TP session exists but RouterOS API on port {router.nat_port} did not respond.",
                        )
                    _publish(session, router, {
                        "event": "router_unreachable",
                        "customer": router.ppp_username,
                    })
                log_error(session, "health_check", exc, router)
            router.updated_at = datetime.utcnow()
            session.add(router)
            session.commit()


class ConcentratorWorker:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if not settings.concentrator_enabled or self._thread:
            return
        self._thread = threading.Thread(target=self._run, name="tresa-concentrator", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._thread = None

    def _run(self) -> None:
        next_poll = 0.0
        next_health = 0.0
        chr_available = False
        while not self._stop.wait(1):
            now = time.monotonic()
            if now >= next_poll:
                chr_available = poll_tunnels()
                next_poll = now + 30
            if now >= next_health:
                if chr_available:
                    health_check()
                next_health = now + 60


concentrator_worker = ConcentratorWorker()
