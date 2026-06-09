import os
import secrets
from typing import Iterable
from urllib.parse import urlparse

from sqlmodel import Session, select

from app.models.router import Router
from app.core.config import settings
from app.services.routers.concentrator import registration_token


MIN_DYNAMIC_API_PORT = int(os.getenv("ROUTER_API_PORT_MIN", "49152"))
MAX_DYNAMIC_API_PORT = int(os.getenv("ROUTER_API_PORT_MAX", "65534"))
CHR_HOST = os.getenv("ROUTER_CHR_HOST", "23.92.30.38")
CHR_TUNNEL_ADDRESS = os.getenv("ROUTER_CHR_TUNNEL_ADDRESS", "10.0.0.1")
L2TP_USERNAME = os.getenv("ROUTER_L2TP_USER", "")
L2TP_PASSWORD = os.getenv("ROUTER_L2TP_PASSWORD", "")

RESERVED_MANAGEMENT_PORTS = {
    21,
    22,
    23,
    80,
    443,
    8291,
    8729,
}


def generate_api_port(session: Session) -> int:
    used_ports = set(session.exec(select(Router.port)).all())
    available_size = MAX_DYNAMIC_API_PORT - MIN_DYNAMIC_API_PORT + 1
    if len(used_ports) >= available_size:
        raise RuntimeError("No router API ports are available")

    for _ in range(256):
        port = secrets.randbelow(available_size) + MIN_DYNAMIC_API_PORT
        if port not in used_ports and port not in RESERVED_MANAGEMENT_PORTS:
            return port
    raise RuntimeError("Could not allocate a unique router API port")


def generate_api_username(router_id: str) -> str:
    return f"tresa_{router_id.replace('-', '')[:10]}"


def generate_api_password() -> str:
    return secrets.token_urlsafe(24)


def validate_api_port(port: int) -> None:
    if port in RESERVED_MANAGEMENT_PORTS:
        raise ValueError(
            f"Port {port} is a standard management port. Use a high, unique API port instead."
        )


def _routeros_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _routeros_csv(values: Iterable[str]) -> str:
    return ",".join(value.strip() for value in values if value.strip())


def build_secure_setup_script(
    router: Router,
    api_base_url: str,
    *,
    include_walled_garden: bool = False,
) -> str:
    api_base_url = api_base_url.rstrip("/")
    if not api_base_url.startswith(("http://", "https://")):
        raise ValueError("API base URL must start with http:// or https://")
    portal_domain = _routeros_quote(urlparse(api_base_url).hostname or "renult.vercel.app")
    token = registration_token(router.id)
    api_url = _routeros_quote(api_base_url)
    chr_host = _routeros_quote(settings.chr_host)
    ipsec_secret = _routeros_quote(settings.router_l2tp_ipsec_secret)
    snmp_community = _routeros_quote(settings.snmp_community)
    token = _routeros_quote(token)
    if not ipsec_secret:
        raise RuntimeError("ROUTER_L2TP_IPSEC_SECRET is not configured")

    if include_walled_garden:
        walled_garden_block = (
            "\n    # 7. Walled garden — allow billing portal before hotspot login.\n"
            f'    :local portalDomain "{portal_domain}"\n'
            "    :do {\n"
            '        :foreach wge in=[/ip hotspot walled-garden find where comment~"Tresa:"] do={ /ip hotspot walled-garden remove $wge }\n'
            '        /ip hotspot walled-garden add dst-host=$portalDomain comment="Tresa: billing portal"\n'
            '        /ip hotspot walled-garden add dst-host=("*." . $portalDomain) comment="Tresa: billing portal wildcard"\n'
            '        :put "Step 7: Walled garden set for Renult portal."\n'
            "    } on-error={\n"
            '        :put "Step 7: Walled garden skipped (hotspot not yet active — provision from dashboard)."\n'
            "    }"
        )
        wg_status = "Configured (if hotspot active)"
    else:
        walled_garden_block = ""
        wg_status = "Skipped"

    return f"""# TRESA BILL AUTO-REGISTRATION (RouterOS v6.45+ and v7)
# Paste this complete block at once, or import it as a .rsc file.
:do {{
    :local apiBase "{api_url}"
    :local chrHost "{chr_host}"
    :local ipsecSecret "{ipsec_secret}"
    :local registrationToken "{token}"
    :local snmpCommunity "{snmp_community}"

    :global tresaJsonValue do={{
        :local marker ("\\\"" . $key . "\\\":")
        :local start [:find $payload $marker]
        :if ([:typeof $start] = "nil") do={{ :return "" }}
        :set start ($start + [:len $marker])
        :local first [:pick $payload $start ($start + 1)]
        :if ($first = "\\\"") do={{
            :set start ($start + 1)
            :local finish [:find $payload "\\\"" $start]
            :return [:pick $payload $start $finish]
        }}
        :local comma [:find $payload "," $start]
        :local brace [:find $payload "}}" $start]
        :local finish $brace
        :if (([:typeof $comma] != "nil") && ($comma < $brace)) do={{ :set finish $comma }}
        :return [:pick $payload $start $finish]
    }}

    # 1. Validate internet and identify ether1.
    :if ([/ping 8.8.8.8 count=3] = 0) do={{ :error "No internet connection. Check your WAN." }}
    :local wanId [/interface ethernet find where default-name="ether1"]
    :if ([:len $wanId] = 0) do={{
        :set wanId [/interface ethernet find where name="ether1"]
    }}
    :if ([:len $wanId] = 0) do={{ :error "ether1 was not found" }}
    :local macAddress [/interface ethernet get $wanId mac-address]
    :local boardName [/system resource get board-name]
    :local osVersion [/system resource get version]
    :local serialNumber [/system routerboard get serial-number]

    # 2. Register with the configured backend.
    :local registerBody ("{{\\\"token\\\":\\\"" . $registrationToken . "\\\",\\\"mac\\\":\\\"" . $macAddress . "\\\",\\\"model\\\":\\\"" . $boardName . "\\\",\\\"version\\\":\\\"" . $osVersion . "\\\",\\\"serial\\\":\\\"" . $serialNumber . "\\\"}}")
    :local registerResult [/tool fetch url=($apiBase . "/api/routers/register") http-method=post http-data=$registerBody http-header-field="Content-Type: application/json" output=user as-value]
    :if (($registerResult->"status") != "finished") do={{ :error "Backend registration request did not finish" }}
    :local registerData ($registerResult->"data")
    :local registerStatus [$tresaJsonValue payload=$registerData key="status"]
    :if (($registerStatus != "success") && ($registerStatus != "already_registered")) do={{
        :put ("Backend response: " . $registerData)
        :error "Backend rejected router registration"
    }}
    :local pppUser [$tresaJsonValue payload=$registerData key="ppp_username"]
    :local pppPass [$tresaJsonValue payload=$registerData key="ppp_password"]
    :local apiPass [$tresaJsonValue payload=$registerData key="api_password"]
    :if (($pppUser = "") || ($pppPass = "") || ($apiPass = "")) do={{ :error "Incomplete registration response" }}

    # 3. Create the restricted management account and save its credential.
    :if ([:len [/user group find where name="tresa-monitor"]] = 0) do={{
        /user group add name="tresa-monitor" policy=api,read,write,test comment="Tresa router monitoring"
    }} else={{
        /user group set [find where name="tresa-monitor"] policy=api,read,write,test
    }}
    :if ([:len [/user find where name="billingapi"]] = 0) do={{
        /user add name="billingapi" password=$apiPass group=tresa-monitor disabled=no comment="Tresa Bill API User - DO NOT DELETE"
    }} else={{
        /user set [find where name="billingapi"] password=$apiPass group=tresa-monitor disabled=no comment="Tresa Bill API User - DO NOT DELETE"
    }}
    :local credentialBody ("{{\\\"token\\\":\\\"" . $registrationToken . "\\\",\\\"mac\\\":\\\"" . $macAddress . "\\\",\\\"api_user\\\":\\\"billingapi\\\",\\\"api_pass\\\":\\\"" . $apiPass . "\\\"}}")
    :local credentialResult [/tool fetch url=($apiBase . "/api/routers/set-credentials") http-method=post http-data=$credentialBody http-header-field="Content-Type: application/json" output=user as-value]
    :if (($credentialResult->"status") != "finished") do={{ :error "Credential callback did not finish" }}

    # 4. Recreate and verify the L2TP/IPsec tunnel.
    :foreach oldTunnel in=[/interface l2tp-client find where name="tresa-tunnel"] do={{
        /interface l2tp-client remove $oldTunnel
    }}
    /interface l2tp-client add name="tresa-tunnel" connect-to=$chrHost user=$pppUser password=$pppPass use-ipsec=yes ipsec-secret=$ipsecSecret disabled=no keepalive-timeout=30 add-default-route=no comment="Tresa Bill Tunnel - DO NOT DELETE"
    :delay 10s
    :local tunnelId [/interface l2tp-client find where name="tresa-tunnel"]
    :if ([:len $tunnelId] = 0) do={{ :error "Tunnel interface was not created" }}
    :if ([/interface l2tp-client get $tunnelId running] != true) do={{ :error "Tunnel failed to connect" }}

    # 5. Restrict API access and install idempotent firewall rules.
    :if (([:len [/interface list find where name="LAN"]] > 0) && ([:len [/interface list member find where interface="tresa-tunnel"]] = 0)) do={{
        /interface list member add interface="tresa-tunnel" list=LAN comment="Tresa Bill - DO NOT DELETE"
    }}
    /ip service set api disabled=no port=8728 address=10.0.0.0/16,192.168.88.0/24
    /ip service set api-ssl disabled=yes
    :foreach ruleId in=[/ip firewall filter find where comment~"Tresa:"] do={{ /ip firewall filter remove $ruleId }}
    /ip firewall filter add chain=input src-address-list=tresa_blacklist action=drop comment="Tresa: block blacklisted"
    /ip firewall filter add chain=input protocol=tcp dst-port=8728 connection-limit=5,32 action=add-src-to-address-list address-list=tresa_blacklist address-list-timeout=30d comment="Tresa: brute force protection"
    /ip firewall filter add chain=input in-interface="tresa-tunnel" protocol=tcp dst-port=8728 action=accept comment="Tresa: allow tunnel traffic"
    /ip firewall filter add chain=input in-interface="tresa-tunnel" protocol=udp dst-port=161 action=accept comment="Tresa: allow SNMP monitoring"
    :local allowRule [/ip firewall filter find where comment="Tresa: allow tunnel traffic"]
    :if ([:len $allowRule] > 0) do={{ /ip firewall filter move $allowRule 0 }}
    :local snmpAllowRule [/ip firewall filter find where comment="Tresa: allow SNMP monitoring"]
    :if ([:len $snmpAllowRule] > 0) do={{ /ip firewall filter move $snmpAllowRule 0 }}
    /snmp set enabled=yes
    :local snmpCommunityId [/snmp community find where name=$snmpCommunity]
    :if ([:len $snmpCommunityId] = 0) do={{
        /snmp community add name=$snmpCommunity addresses=10.0.0.0/16 read-access=yes write-access=no
    }} else={{
        /snmp community set $snmpCommunityId addresses=10.0.0.0/16 read-access=yes write-access=no
    }}
    :if (($snmpCommunity != "public") && ([:len [/snmp community find where name="public"]] > 0)) do={{
        /snmp community set [find where name="public"] addresses=127.0.0.1/32 write-access=no
    }}

    # 6. Confirm provisioning and require real returned values.
    :local confirmBody ("{{\\\"token\\\":\\\"" . $registrationToken . "\\\",\\\"mac\\\":\\\"" . $macAddress . "\\\",\\\"status\\\":\\\"ready\\\"}}")
    :local confirmResult [/tool fetch url=($apiBase . "/api/routers/confirm") http-method=post http-data=$confirmBody http-header-field="Content-Type: application/json" output=user as-value]
    :if (($confirmResult->"status") != "finished") do={{ :error "Provisioning confirmation did not finish" }}
    :local confirmData ($confirmResult->"data")
    :local natPort [$tresaJsonValue payload=$confirmData key="nat_port"]
    :local tunnelIp [$tresaJsonValue payload=$confirmData key="tunnel_ip"]
    :if (($natPort = "") || ($natPort = "0") || ($tunnelIp = "")) do={{
        :put ("Confirmation response: " . $confirmData)
        :error "Backend did not return a valid tunnel IP and NAT port"
    }}
    :if ([/interface l2tp-client get $tunnelId running] != true) do={{ :error "Final tunnel verification failed" }}
{walled_garden_block}
    # 8. Final verification summary.
    :local snmpOk "yes"
    :if ([/snmp get enabled] != true) do={{ :set snmpOk "disabled" }}
    :local apiOk "yes"
    :if ([:len [/user find where name="billingapi" disabled=no]] = 0) do={{ :set apiOk "MISSING" }}
    :put "================================================"
    :put " TRESA BILL - SETUP COMPLETE"
    :put (" Router ID    : " . $pppUser)
    :put (" Tunnel IP    : " . $tunnelIp)
    :put (" NAT Port     : " . $natPort)
    :put (" Tunnel       : Connected")
    :put (" API User     : " . $apiOk)
    :put (" SNMP         : " . $snmpOk)
    :put (" Walled Garden: {wg_status}")
    :put " NEXT: Open Renult dashboard - router will appear online."
    :put "================================================"
}} on-error={{
    :put "================================================"
    :put " TRESA BILL SETUP FAILED"
    :put " Nothing was committed. Review the error above."
    :put "================================================"
    :error "Tresa setup failed"
}}
"""
