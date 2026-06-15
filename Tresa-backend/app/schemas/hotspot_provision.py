from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# Top-level domains that Chrome/Android preload into HSTS, forcing every
# subdomain to HTTPS on the very first request - before any response is ever
# seen. RouterOS's hotspot captive-portal redirect (and its login page) are
# plain HTTP, so a dns-name under one of these TLDs gets silently rewritten to
# HTTPS by the client and connects to nothing on the router, surfacing as
# "Web page not available ... net::ERR_CONNECTION_CLOSED".
HSTS_PRELOADED_TLDS = {"app", "dev", "page", "new", "foo", "zip", "mov", "phd", "gle", "channel"}


# ── Request schemas ──────────────────────────────────────────


class PppoeUser(BaseModel):
    """A PPPoE secret (username/password) to provision on the router."""

    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=255)
    profile: str = Field(default="10MBPS", max_length=60)


class HotspotProvisionConfig(BaseModel):
    """
    User-supplied parameters for hotspot provisioning.

    Defaults match the ALTECH reference template so the caller can
    POST an empty body and get a sensible default config.
    """

    # ── Interface assignment ────────────────────────────────
    wan_interface_index: int = Field(
        default=1,
        ge=1,
        description="Which ether port is the ISP uplink (1 = ether1).",
    )
    mgmt_interface_index: Optional[int] = Field(
        default=None,
        ge=1,
        description="Optional management port number excluded from bridge.",
    )

    # ── IP / Pool ───────────────────────────────────────────
    bridge_ip: str = Field(default="172.16.0.1", max_length=15)
    bridge_subnet: int = Field(default=24, ge=8, le=30)
    pool_start: str = Field(default="172.16.0.2", max_length=15)
    pool_end: str = Field(default="172.16.0.254", max_length=15)

    # ── PPPoE ───────────────────────────────────────────────
    rate_limit: str = Field(
        default="2M/2M",
        max_length=40,
        description="Upload/Download rate-limit string (e.g. '2M/2M').",
    )
    pppoe_profile_name: str = Field(default="10MBPS", max_length=60)
    pppoe_service_name: str = Field(default="PPPOE", max_length=60)
    pppoe_users: list[PppoeUser] = Field(
        default_factory=lambda: [
            PppoeUser(username="altech", password="altech"),
            PppoeUser(username="hspotagent", password="test123"),
        ],
    )

    # ── Upstream ISP PPPoE client ───────────────────────────
    enable_pppoe_client: bool = Field(
        default=True,
        description="Whether the router should dial an upstream ISP via PPPoE.",
    )
    isp_username: Optional[str] = Field(default=None, max_length=120)
    isp_password: Optional[str] = Field(default=None, max_length=255)

    # ── DNS ─────────────────────────────────────────────────
    dns_servers: str = Field(default="8.8.8.8,8.8.4.4", max_length=120)

    # ── Services ─────────────────────────────────────────────
    enable_hotspot: bool = Field(
        default=True,
        description="Whether to set up the captive-portal hotspot server.",
    )
    enable_pppoe_server: bool = Field(
        default=True,
        description="Whether to set up a PPPoE server for downstream clients.",
    )
    hotspot_dns_name: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Portal domain advertised by the hotspot server (e.g. wifi.renult.xyz).",
    )

    @field_validator("hotspot_dns_name")
    @classmethod
    def _validate_hotspot_dns_name(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        value = value.strip().lower()
        tld = value.rsplit(".", 1)[-1]
        if tld in HSTS_PRELOADED_TLDS:
            raise ValueError(
                f'"{value}" cannot be used as the hotspot portal domain: ".{tld}" is '
                "HSTS-preloaded, so browsers force HTTPS for it and the captive "
                "portal login page (served over plain HTTP by the router) becomes "
                "unreachable (net::ERR_CONNECTION_CLOSED). Use a domain on a "
                "different TLD, e.g. wifi.renult.xyz, or leave this blank."
            )
        return value

    # ── Anti-sharing (firewall mangle) ──────────────────────
    enable_anti_sharing: bool = Field(
        default=False,
        description="Add firewall mangle rules and limit each voucher to one device.",
    )

    # ── WiFi ─────────────────────────────────────────────────
    wifi_enabled: bool = Field(
        default=True,
        description="Whether to bridge and configure the router's wireless interface.",
    )
    wifi_ssid: Optional[str] = Field(
        default=None,
        max_length=32,
        description="SSID to broadcast on the router's wireless interface.",
    )


# ── Response schemas ─────────────────────────────────────────


class CommandResult(BaseModel):
    """Result of a single RouterOS API command."""

    step: str
    path: str
    action: str
    params: dict[str, Any] = {}
    success: bool
    error: Optional[str] = None


class RouterHardwareResponse(BaseModel):
    """Detected hardware capabilities of a router."""

    router_id: UUID
    router_name: str
    identity: Optional[str] = None
    ethernet_ports: list[dict[str, Any]] = []
    has_wireless: bool = False
    wireless_interfaces: list[dict[str, Any]] = []
    port_count: int = 0
    error: Optional[str] = None


class HotspotProvisionResponse(BaseModel):
    """Result of provisioning a router for hotspot."""

    success: bool
    router_id: UUID
    router_name: str
    hardware: dict[str, Any] = {}
    commands_executed: int = 0
    command_log: list[CommandResult] = []
    error: Optional[str] = None
