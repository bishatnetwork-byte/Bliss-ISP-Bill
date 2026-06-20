from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.config import settings


class RouterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    host: Optional[str] = Field(default=None, min_length=1, max_length=255)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    username: Optional[str] = Field(default=None, min_length=1, max_length=120)
    password: Optional[str] = Field(default=None, min_length=1, max_length=255)
    plaintext_login: bool = True
    location: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    is_active: bool = True


class RouterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    host: Optional[str] = Field(default=None, min_length=1, max_length=255)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    username: Optional[str] = Field(default=None, min_length=1, max_length=120)
    password: Optional[str] = Field(default=None, min_length=1, max_length=255)
    plaintext_login: Optional[bool] = None
    location: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    is_active: Optional[bool] = None


class RouterCredentialsUpdate(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=255)


class RouterResponse(BaseModel):
    id: UUID
    branch_id: UUID
    name: str
    host: str
    port: int
    username: str
    plaintext_login: bool
    location: Optional[str]
    description: Optional[str]
    is_active: bool
    ppp_username: Optional[str] = None
    tunnel_ip: Optional[str] = None
    nat_port: Optional[int] = None
    trial_enabled: bool = False
    trial_minutes: int = 30
    status: str = "pending"
    hotspot_provisioned: bool = False
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    reachable: Optional[bool] = None
    latency_ms: Optional[float] = None
    connectivity_error: Optional[str] = None


class RouterPingRequest(BaseModel):
    target: Optional[str] = Field(default=None, min_length=1, max_length=255)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    timeout_seconds: float = Field(default=3.0, ge=0.1, le=30)


class RouterPingResponse(BaseModel):
    reachable: bool
    host: str
    port: Optional[int] = None
    latency_ms: Optional[float]
    error: Optional[str] = None


class RouterRebootResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    message: str
    error: Optional[str] = None


class RouterStatusResponse(BaseModel):
    connected: bool
    router_id: UUID
    router_name: str
    system_resource: Optional[dict[str, Any]] = None
    interfaces: list[dict[str, Any]] = []
    ip_addresses: list[dict[str, Any]] = []
    dhcp_leases: list[dict[str, Any]] = []
    error: Optional[str] = None


class RouterFeaturesResponse(BaseModel):
    connected: bool
    router_id: UUID
    router_name: str
    features: dict[str, Any]
    error: Optional[str] = None


class RouterActiveUsersResponse(BaseModel):
    connected: bool
    router_id: UUID
    router_name: str
    count: int
    active_users: list[dict[str, Any]]
    error: Optional[str] = None


class RouterVouchersResponse(BaseModel):
    connected: bool
    router_id: UUID
    router_name: str
    count: int
    vouchers: list[dict[str, Any]]
    profiles: list[dict[str, Any]]
    profiles_error: Optional[str] = None
    error: Optional[str] = None


class RouterLogsResponse(BaseModel):
    connected: bool
    router_id: UUID
    router_name: str
    logs: list[dict[str, Any]]
    error: Optional[str] = None


class RouterRemoteAccessResponse(BaseModel):
    router_id: UUID
    router_name: str
    enabled: bool
    protocol: str
    service: str
    host: str
    port: int
    endpoint: str
    url: str
    api_port: int
    api_endpoint: str
    api_protocol: str = "MikroTik API"


class RouterSecureSetupResponse(BaseModel):
    router_id: UUID
    router_name: str
    host: str
    api_port: int
    api_username: str
    api_password: str
    allowed_source: str
    script: str
    warning: str


class RouterRegisterRequest(BaseModel):
    token: str = Field(min_length=20, max_length=300)
    mac: str = Field(min_length=12, max_length=30)
    model: str = Field(default="unknown", max_length=255)
    version: str = Field(default="unknown", max_length=255)
    serial: str = Field(default="", max_length=255)


class RouterRegisterResponse(BaseModel):
    status: str
    ppp_username: str
    ppp_password: str
    api_username: str
    api_password: str
    tunnel_ip: str


class RouterCredentialsRequest(BaseModel):
    token: str = Field(min_length=20, max_length=300)
    mac: str = Field(min_length=12, max_length=30)
    api_user: str = Field(min_length=1, max_length=120)
    api_pass: str = Field(min_length=12, max_length=255)


class RouterConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=300)
    mac: str = Field(min_length=12, max_length=30)
    status: str = Field(default="ready", max_length=30)


class RouterHeartbeatRequest(BaseModel):
    token: str = Field(min_length=40, max_length=200)
    mac: str = Field(min_length=12, max_length=30)
    uptime: Optional[str] = Field(default=None, max_length=80)


class RouterHeartbeatResponse(BaseModel):
    status: str
    server_time: datetime


class RouterDeployHeartbeatRequest(BaseModel):
    api_base_url: str = Field(default=settings.portal_public_api_url, min_length=8, max_length=500)


class RouterDeployHeartbeatResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    message: str
    error: Optional[str] = None


class RouterProvisionRequest(BaseModel):
    ppp_username: str = Field(min_length=1, max_length=120)


class RouterProvisionResponse(BaseModel):
    router_id: UUID
    status: str
    nat_port: int
    tunnel_ip: str


class RouterResourceResponse(BaseModel):
    router_id: UUID
    status: str
    resource: dict[str, Any]


class RouterCommandRequest(BaseModel):
    path: str = Field(min_length=1, max_length=120)
    action: str = Field(default="print", max_length=30)
    params: dict[str, str] = Field(default_factory=dict)


class RouterCommandResponse(BaseModel):
    router_id: UUID
    result: Any


class RouterTestConnectionRequest(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=255)
    plaintext_login: bool = True


class RouterTestConnectionResponse(BaseModel):
    reachable: bool
    connected: bool
    host: str
    port: int
    latency_ms: Optional[float] = None
    system_identity: Optional[str] = None
    error: Optional[str] = None


class RouterPublishScriptRequest(BaseModel):
    api_base_url: str = Field(default=settings.portal_public_api_url, min_length=8, max_length=500)
    include_walled_garden: bool = True


class RouterPublishScriptResponse(BaseModel):
    router_id: UUID
    router_name: str
    script_url: str
    mikrotik_v7_command: str
    mikrotik_v6_command: str
    expires_note: str


class RouterTrialUpdate(BaseModel):
    trial_enabled: bool
    trial_minutes: int = Field(default=30, ge=1, le=1440)


class RouterTrialResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    trial_enabled: bool
    trial_minutes: int
    router_sync_error: Optional[str] = None
