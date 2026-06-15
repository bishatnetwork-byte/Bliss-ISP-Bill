from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PlatformOverviewResponse(BaseModel):
    users: int
    active_users: int
    branches: int
    routers: int
    tunnels_online: int
    tunnels_offline: int
    vouchers: int
    activated_vouchers: int
    expired_vouchers: int
    wallet_balance: int
    platform_fees: int
    r2_configured: bool
    dns_configured: bool
    dns_provider: str
    telegram_admins: int


class PlatformUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    phone_number: Optional[str]
    is_verified: bool
    is_active: bool
    allowed_sections: list[str]
    platform_role: Optional[str]
    platform_permissions: list[str]
    branches: int
    routers: int
    vouchers: int
    wallet_balance: int
    created_at: datetime


class PlatformUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    allowed_sections: Optional[list[str]] = None


class PlatformSubadminUpdate(BaseModel):
    role: Optional[str] = Field(default="subadmin", pattern="^(subadmin|none)$")
    permissions: list[str] = Field(default_factory=list)


class PlatformSettingsResponse(BaseModel):
    voucher_fee_type: str
    voucher_fee_value: float
    deposit_fee_percentage: float
    withdrawal_fee_percentage: float
    voucher_prefix: str
    voucher_prefix_order: str
    telegram_access_alerts: bool


class PlatformSettingsUpdate(BaseModel):
    voucher_fee_type: str = Field(pattern="^(fixed|percentage)$")
    voucher_fee_value: float = Field(ge=0)
    deposit_fee_percentage: float = Field(ge=0, le=100)
    withdrawal_fee_percentage: float = Field(ge=0, le=100)
    voucher_prefix: str = Field(min_length=0, max_length=20)
    voucher_prefix_order: str = Field(pattern="^(prefix-first|prefix-last)$")
    telegram_access_alerts: bool = False


class PlatformWalletResponse(BaseModel):
    id: UUID
    user_id: UUID
    owner_name: str
    branch_id: UUID
    branch_name: str
    balance: int
    total_deposited: int
    total_withdrawn: int
    total_fees_paid: int
    is_frozen: bool
    updated_at: datetime


class PlatformTunnelResponse(BaseModel):
    id: UUID
    router_name: str
    owner_name: str
    branch_name: str
    is_active: bool
    status: str
    heartbeat_status: str
    snmp_status: str
    tunnel_ip: Optional[str]
    ppp_username: Optional[str]
    nat_port: Optional[int]
    winbox_nat_port: Optional[int]
    connected_at: Optional[datetime]
    disconnected_at: Optional[datetime]
    last_seen: Optional[datetime]


class PlatformVoucherAuditResponse(BaseModel):
    id: UUID
    voucher_code: str
    router_name: str
    event: str
    previous_status: Optional[str]
    new_status: str
    activated_at: Optional[datetime]
    expires_at: Optional[datetime]
    metadata: Any = None
    created_at: datetime


class PlatformAuditResponse(BaseModel):
    id: UUID
    actor_id: Optional[UUID]
    actor_name: Optional[str]
    action: str
    target_type: str
    target_id: Optional[str]
    details: Any = None
    created_at: datetime


class PlatformStorageObjectResponse(BaseModel):
    key: str
    size: int
    last_modified: Optional[datetime]
    etag: Optional[str]
    url: str


class PlatformBroadcastRequest(BaseModel):
    channels: list[str] = Field(min_length=1)
    user_ids: list[UUID] = Field(default_factory=list)
    send_to_all: bool = False
    subject: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=5000)


class PlatformBroadcastResponse(BaseModel):
    recipients: int
    email_sent: int
    sms_sent: int
    failed: int


class PlatformDnsZoneResponse(BaseModel):
    id: str
    type: Optional[str] = None
    name: str
    provider: str


class PlatformDnsRecordResponse(BaseModel):
    id: str
    name: str
    type: str
    content: str
    ttl: int
    disabled: bool = False
    proxied: Optional[bool] = None


class PlatformDnsRecordCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=20)
    content: str = Field(min_length=1, max_length=500)
    ttl: int = Field(default=3600, ge=60, le=86400)
    prio: Optional[int] = Field(default=None, ge=0, le=65535)
    disabled: bool = False
    proxied: Optional[bool] = None


class PlatformHealthResponse(BaseModel):
    status: str
    database: str
    concentrator_enabled: bool
    snmp_monitor_enabled: bool
    r2: str
    dns: str
    dns_provider: str
    email: str
    sms: str
    payment_gateway: str
    router_errors_24h: int
    last_router_error: Optional[str] = None
