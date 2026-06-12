"""
MikroTik Hotspot Configuration Provisioning Engine
===================================================

Detects router hardware (port count, wireless, identity) and generates + executes
the correct RouterOS API commands to set up PPPoE / Hotspot / NAT / DNS — adapting
dynamically to whatever hardware the router has.

Reference script: ``mikrotik_restore_template.rsc`` in this directory.
"""

from __future__ import annotations

import logging
from ipaddress import ip_interface
from typing import Any

from app.models.router import Router
from app.schemas.hotspot_provision import (
    CommandResult,
    HotspotProvisionConfig,
)
from app.services.routers.routeros import router_connection

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# 1. HARDWARE DETECTION
# ═══════════════════════════════════════════════════════════════


def detect_router_hardware(router: Router) -> dict[str, Any]:
    """
    Connect to the router and discover its physical capabilities.

    Returns a dict with:
      - identity          : str | None
      - ethernet_ports     : list[dict]   (each port's current + default name)
      - has_wireless       : bool
      - wireless_interfaces: list[dict]
      - port_count         : int
      - error              : str | None
    """
    try:
        with router_connection(router) as api:
            # System identity
            identity_res = api.get_resource("/system/identity").get()
            identity = identity_res[0].get("name") if identity_res else None

            # Ethernet ports
            ethernet_ports: list[dict[str, Any]] = [
                dict(item) for item in api.get_resource("/interface/ethernet").get()
            ]

            # Wireless interfaces (may not exist on wired-only models)
            wireless_interfaces: list[dict[str, Any]] = []
            try:
                wireless_interfaces = [
                    dict(item) for item in api.get_resource("/interface/wireless").get()
                ]
            except Exception:
                pass  # no wireless package / not supported

            return {
                "identity": identity,
                "ethernet_ports": ethernet_ports,
                "has_wireless": len(wireless_interfaces) > 0,
                "wireless_interfaces": wireless_interfaces,
                "port_count": len(ethernet_ports),
                "error": None,
            }
    except Exception as exc:
        logger.exception("Hardware detection failed for router %s", router.name)
        return {
            "identity": None,
            "ethernet_ports": [],
            "has_wireless": False,
            "wireless_interfaces": [],
            "port_count": 0,
            "error": str(exc),
        }


# ═══════════════════════════════════════════════════════════════
# 2. COMMAND GENERATION
# ═══════════════════════════════════════════════════════════════


def _ether_default_name(port: dict[str, Any]) -> str:
    """Return the factory default name of an ethernet port."""
    return port.get("default-name", port.get("name", ""))


def generate_config_commands(
    hardware: dict[str, Any],
    config: HotspotProvisionConfig,
) -> list[dict[str, Any]]:
    """
    Translate detected hardware + desired config into a list of RouterOS API
    command descriptors.  Each descriptor is a dict::

        {
            "step": "human-readable label",
            "path": "/interface/ethernet",
            "action": "set",           # set | add | call
            "find": {"default-name": "ether1"},   # for set operations
            "params": {"name": "ether1-ISP"},
        }
    """
    cmds: list[dict[str, Any]] = []
    ethernet_ports = hardware.get("ethernet_ports", [])
    wireless_interfaces = hardware.get("wireless_interfaces", [])
    has_wireless = hardware.get("has_wireless", False)
    wlan_name = wireless_interfaces[0].get("name", "wlan1") if wireless_interfaces else "wlan1"

    wan_idx = config.wan_interface_index  # 1-based
    mgmt_idx = config.mgmt_interface_index  # 1-based or None

    hotspot_ports: list[str] = []  # renamed names for bridge membership

    # ── 1. Rename interfaces ────────────────────────────────
    for port in ethernet_ports:
        default_name = _ether_default_name(port)
        # Extract port number from default name (e.g. "ether3" → 3)
        try:
            port_num = int(default_name.replace("ether", ""))
        except (ValueError, AttributeError):
            continue

        if port_num == wan_idx:
            new_name = f"{default_name}-ISP"
            cmds.append({
                "step": f"Rename {default_name} → {new_name} (WAN uplink)",
                "path": "/interface/ethernet",
                "action": "set",
                "find": {"default-name": default_name},
                "params": {"name": new_name},
            })
        elif mgmt_idx is not None and port_num == mgmt_idx:
            new_name = f"{default_name}-MGMT"
            cmds.append({
                "step": f"Rename {default_name} → {new_name} (Management)",
                "path": "/interface/ethernet",
                "action": "set",
                "find": {"default-name": default_name},
                "params": {"name": new_name},
            })
        else:
            new_name = f"{default_name}-HOTSPOT/PPPOE"
            hotspot_ports.append(new_name)
            cmds.append({
                "step": f"Rename {default_name} → {new_name} (Hotspot/PPPoE)",
                "path": "/interface/ethernet",
                "action": "set",
                "find": {"default-name": default_name},
                "params": {"name": new_name},
            })

    wan_iface = f"ether{wan_idx}-ISP"

    # ── 2. Bridge setup ─────────────────────────────────────
    cmds.append({
        "step": "Create bridge_hotspot",
        "path": "/interface/bridge",
        "action": "add",
        "find": {"name": "bridge_hotspot"},
        "params": {
            "name": "bridge_hotspot",
            "protocol-mode": "rstp",
            "fast-forward": "yes",
        },
    })

    for hp in hotspot_ports:
        cmds.append({
            "step": f"Add {hp} to bridge_hotspot",
            "path": "/interface/bridge/port",
            "action": "add",
            "find": {"interface": hp},
            "params": {"bridge": "bridge_hotspot", "interface": hp, "hw": "yes"},
        })

    if has_wireless and config.wifi_enabled:
        cmds.append({
            "step": f"Add {wlan_name} to bridge_hotspot",
            "path": "/interface/bridge/port",
            "action": "add",
            "find": {"interface": wlan_name},
            "params": {"bridge": "bridge_hotspot", "interface": wlan_name, "hw": "yes"},
        })

    # ── 3. IP addressing ────────────────────────────────────
    cmds.append({
        "step": f"Assign {config.bridge_ip}/{config.bridge_subnet} to bridge_hotspot",
        "path": "/ip/address",
        "action": "add",
        "find": {
            "address": f"{config.bridge_ip}/{config.bridge_subnet}",
            "interface": "bridge_hotspot",
        },
        "params": {
            "address": f"{config.bridge_ip}/{config.bridge_subnet}",
            "interface": "bridge_hotspot",
        },
    })

    # ── 4. IP pools ─────────────────────────────────────────
    pool_range = f"{config.pool_start}-{config.pool_end}"
    hotspot_network = str(ip_interface(f"{config.bridge_ip}/{config.bridge_subnet}").network)
    cmds.append({
        "step": "Create pppoe_pool",
        "path": "/ip/pool",
        "action": "add",
        "find": {"name": "pppoe_pool"},
        "params": {"name": "pppoe_pool", "ranges": pool_range},
    })

    if config.enable_hotspot:
        cmds.append({
            "step": "Create hotspot_pool",
            "path": "/ip/pool",
            "action": "add",
            "find": {"name": "hotspot_pool"},
            "params": {"name": "hotspot_pool", "ranges": pool_range},
        })

        # ── 5. DHCP + Hotspot server ─────────────────────────
        cmds.append({
            "step": "Create hotspot DHCP network",
            "path": "/ip/dhcp-server/network",
            "action": "add",
            "find": {"address": hotspot_network},
            "params": {
                "address": hotspot_network,
                "gateway": config.bridge_ip,
                "dns-server": config.dns_servers,
            },
        })
        cmds.append({
            "step": "Create hotspot DHCP server",
            "path": "/ip/dhcp-server",
            "action": "add",
            "find": {"name": "dhcp_hotspot"},
            "params": {
                "name": "dhcp_hotspot",
                "interface": "bridge_hotspot",
                "address-pool": "hotspot_pool",
                "lease-time": "1h",
                "disabled": "no",
            },
        })
        cmds.append({
            "step": "Create hotspot server profile",
            "path": "/ip/hotspot/profile",
            "action": "add",
            "find": {"name": "hotspot_profile"},
            "params": {
                "name": "hotspot_profile",
                "hotspot-address": config.bridge_ip,
                "dns-name": config.hotspot_dns_name or "wifi.renult.local",
                "login-by": "http-chap,http-pap",
            },
        })
        cmds.append({
            "step": "Create hotspot server on bridge_hotspot",
            "path": "/ip/hotspot",
            "action": "add",
            "find": {"name": "hotspot1"},
            "params": {
                "name": "hotspot1",
                "interface": "bridge_hotspot",
                "address-pool": "hotspot_pool",
                "profile": "hotspot_profile",
                "disabled": "no",
            },
        })

        # ── Anti-sharing: mangle rules + one device per voucher ──
        if config.enable_anti_sharing:
            cmds.append({
                "step": "Limit hotspot vouchers to one device each",
                "path": "/ip/hotspot/user/profile",
                "action": "set",
                "find": {"name": "default"},
                "params": {"shared-users": "1"},
            })
            cmds.append({
                "step": "Add mangle rule marking hotspot connections",
                "path": "/ip/firewall/mangle",
                "action": "add",
                "find": {"comment": "Tresa: anti-sharing connection mark"},
                "params": {
                    "chain": "prerouting",
                    "in-interface": "bridge_hotspot",
                    "action": "mark-connection",
                    "new-connection-mark": "hotspot-conn",
                    "passthrough": "yes",
                    "comment": "Tresa: anti-sharing connection mark",
                },
            })
            cmds.append({
                "step": "Add mangle rule marking hotspot packets",
                "path": "/ip/firewall/mangle",
                "action": "add",
                "find": {"comment": "Tresa: anti-sharing packet mark"},
                "params": {
                    "chain": "prerouting",
                    "connection-mark": "hotspot-conn",
                    "action": "mark-packet",
                    "new-packet-mark": "hotspot-packet",
                    "passthrough": "no",
                    "comment": "Tresa: anti-sharing packet mark",
                },
            })

    # ── 6. PPP profile ──────────────────────────────────────
    cmds.append({
        "step": f"Create PPP profile '{config.pppoe_profile_name}'",
        "path": "/ppp/profile",
        "action": "add",
        "find": {"name": config.pppoe_profile_name},
        "params": {
            "name": config.pppoe_profile_name,
            "local-address": config.bridge_ip,
            "remote-address": "pppoe_pool",
            "rate-limit": config.rate_limit,
        },
    })

    # ── 7. PPP secrets + 8. PPPoE server ────────────────────
    if config.enable_pppoe_server:
        for user in config.pppoe_users:
            cmds.append({
                "step": f"Create PPP secret '{user.username}'",
                "path": "/ppp/secret",
                "action": "add",
                "find": {"name": user.username},
                "params": {
                    "name": user.username,
                    "password": user.password,
                    "service": "pppoe",
                    "profile": user.profile,
                },
            })

        cmds.append({
            "step": f"Create PPPoE server '{config.pppoe_service_name}' on bridge_hotspot",
            "path": "/interface/pppoe-server/server",
            "action": "add",
            "find": {"service-name": config.pppoe_service_name, "interface": "bridge_hotspot"},
            "params": {
                "service-name": config.pppoe_service_name,
                "interface": "bridge_hotspot",
                "authentication": "pap,chap,mschap1,mschap2",
                "keepalive-timeout": "10",
                "one-session-per-host": "yes",
                "default-profile": config.pppoe_profile_name,
            },
        })

    # ── 9. PPPoE client (upstream ISP) ──────────────────────
    if config.enable_pppoe_client:
        isp_user = config.isp_username or "altech"
        isp_pass = config.isp_password or "altech"
        cmds.append({
            "step": f"Create PPPoE client on {wan_iface} (ISP dial-out)",
            "path": "/interface/pppoe-client",
            "action": "add",
            "find": {"name": "pppoe-out1"},
            "params": {
                "name": "pppoe-out1",
                "interface": wan_iface,
                "user": isp_user,
                "password": isp_pass,
                "profile": config.pppoe_profile_name,
                "add-default-route": "yes",
                "default-route-distance": "1",
                "keepalive-timeout": "10",
                "use-peer-dns": "no",
                "dial-on-demand": "no",
                "allow": "pap,chap,mschap1,mschap2",
                "disabled": "no",
            },
        })

    # ── 10. NAT masquerade ──────────────────────────────────
    cmds.append({
        "step": f"NAT masquerade on {wan_iface}",
        "path": "/ip/firewall/nat",
        "action": "add",
        "find": {
            "chain": "srcnat",
            "action": "masquerade",
            "out-interface": wan_iface,
        },
        "params": {
            "chain": "srcnat",
            "action": "masquerade",
            "out-interface": wan_iface,
        },
    })

    # ── 11. DNS ─────────────────────────────────────────────
    cmds.append({
        "step": "Configure DNS servers",
        "path": "/ip/dns",
        "action": "set",
        "params": {
            "servers": config.dns_servers,
            "allow-remote-requests": "yes",
        },
    })

    # ── 12. WiFi SSID ────────────────────────────────────────
    if has_wireless and config.wifi_enabled and config.wifi_ssid:
        cmds.append({
            "step": f"Set WiFi SSID to '{config.wifi_ssid}' on {wlan_name}",
            "path": "/interface/wireless",
            "action": "set",
            "find": {"name": wlan_name},
            "params": {
                "ssid": config.wifi_ssid,
                "mode": "ap-bridge",
                "disabled": "no",
            },
        })

    return cmds


# ═══════════════════════════════════════════════════════════════
# 3. COMMAND EXECUTION
# ═══════════════════════════════════════════════════════════════


def _execute_command(api: Any, cmd: dict[str, Any]) -> CommandResult:
    """Execute a single command descriptor against an open API connection."""
    path = cmd["path"]
    action = cmd["action"]
    params = cmd.get("params", {})
    find = cmd.get("find")

    try:
        resource = api.get_resource(path)

        if action == "add":
            if find:
                existing = resource.get(**{k: v for k, v in find.items()})
                if existing:
                    item_id = existing[0].get("id", existing[0].get(".id"))
                    update_params = {
                        key: value
                        for key, value in params.items()
                        if key not in find and key not in {"name", "interface", "address", "service-name"}
                    }
                    if item_id and update_params:
                        try:
                            resource.set(id=item_id, **update_params)
                        except Exception:
                            logger.debug(
                                "Existing item found for %s but update was skipped",
                                cmd["step"],
                                exc_info=True,
                            )
                    return CommandResult(
                        step=cmd["step"],
                        path=path,
                        action=action,
                        params=params,
                        success=True,
                    )
            resource.add(**params)

        elif action == "set":
            if find:
                # Locate the item first, then set attributes
                items = resource.get(**{k: v for k, v in find.items()})
                if not items:
                    return CommandResult(
                        step=cmd["step"],
                        path=path,
                        action=action,
                        params=params,
                        success=False,
                        error=f"No item found matching {find}",
                    )
                item_id = items[0].get("id", items[0].get(".id"))
                if item_id:
                    resource.set(id=item_id, **params)
                else:
                    # For singleton resources (e.g. /ip/dns) — use direct set
                    resource.set(**params)
            else:
                resource.set(**params)

        elif action == "call":
            resource.call(params.get("command", ""), params.get("args", {}))

        return CommandResult(
            step=cmd["step"],
            path=path,
            action=action,
            params=params,
            success=True,
        )

    except Exception as exc:
        logger.warning("Command failed [%s]: %s", cmd["step"], exc)
        return CommandResult(
            step=cmd["step"],
            path=path,
            action=action,
            params=params,
            success=False,
            error=str(exc),
        )


# ═══════════════════════════════════════════════════════════════
# 4. ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════


def provision_hotspot(
    router: Router,
    config: HotspotProvisionConfig | None = None,
) -> dict[str, Any]:
    """
    Full provisioning pipeline:
      1. Detect hardware
      2. Generate commands
      3. Execute each command via RouterOS API

    Returns a dict ready for ``HotspotProvisionResponse``.
    """
    if config is None:
        config = HotspotProvisionConfig()

    # Step 1 — detect hardware
    hardware = detect_router_hardware(router)
    if hardware["error"]:
        return {
            "success": False,
            "hardware": hardware,
            "commands_executed": 0,
            "command_log": [],
            "error": f"Hardware detection failed: {hardware['error']}",
        }

    if hardware["port_count"] == 0:
        return {
            "success": False,
            "hardware": hardware,
            "commands_executed": 0,
            "command_log": [],
            "error": "No ethernet ports detected — cannot provision.",
        }

    # Validate WAN port index
    if config.wan_interface_index > hardware["port_count"]:
        return {
            "success": False,
            "hardware": hardware,
            "commands_executed": 0,
            "command_log": [],
            "error": (
                f"WAN interface index {config.wan_interface_index} exceeds "
                f"available ports ({hardware['port_count']})."
            ),
        }

    # Step 2 — generate commands
    commands = generate_config_commands(hardware, config)

    # Step 3 — execute
    command_log: list[CommandResult] = []
    try:
        with router_connection(router) as api:
            for cmd in commands:
                result = _execute_command(api, cmd)
                command_log.append(result)
                if not result.success:
                    logger.warning(
                        "Non-fatal command failure at step '%s': %s",
                        result.step,
                        result.error,
                    )
    except Exception as exc:
        logger.exception("Connection lost during provisioning of %s", router.name)
        return {
            "success": False,
            "hardware": hardware,
            "commands_executed": len(command_log),
            "command_log": command_log,
            "error": f"Connection lost: {exc}",
        }

    failed = [r for r in command_log if not r.success]
    return {
        "success": len(failed) == 0,
        "hardware": hardware,
        "commands_executed": len(command_log),
        "command_log": command_log,
        "error": f"{len(failed)} command(s) failed" if failed else None,
    }


# ═══════════════════════════════════════════════════════════════
# 5. TRIAL ACCESS
# ═══════════════════════════════════════════════════════════════


def apply_trial_settings(router: Router, trial_enabled: bool, trial_minutes: int) -> str | None:
    """
    Push the free-trial window to every hotspot server profile on the router.

    Sets ``trial-uptime-limit`` to the requested duration (and
    ``trial-uptime-reset`` to "1d" so a device can retry once per day) when
    enabled, or zeroes both fields — RouterOS's documented way of disabling
    the trial feature — when disabled.

    Returns an error string on failure, or ``None`` on success.
    """
    if trial_enabled:
        hours, minutes = divmod(max(1, trial_minutes), 60)
        params = {
            "trial-uptime-limit": f"{hours:02d}:{minutes:02d}:00",
            "trial-uptime-reset": "1d",
        }
    else:
        params = {
            "trial-uptime-limit": "00:00:00",
            "trial-uptime-reset": "00:00:00",
        }

    try:
        with router_connection(router) as api:
            resource = api.get_resource("/ip/hotspot/profile")
            profiles = resource.get()
            if not profiles:
                return "No hotspot server profile found on router"
            for profile in profiles:
                item_id = profile.get("id", profile.get(".id"))
                if item_id:
                    resource.set(id=item_id, **params)
        return None
    except Exception as exc:
        return str(exc)
