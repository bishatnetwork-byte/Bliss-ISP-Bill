from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


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
    account_subdomain: Optional[str]
    subdomain_enabled: bool
    branches: int
    routers: int
    vouchers: int
    wallet_balance: int
    created_at: datetime


class PlatformUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    allowed_sections: Optional[list[str]] = None
    account_subdomain: Optional[str] = Field(default=None, min_length=3, max_length=63, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
    subdomain_enabled: Optional[bool] = None


class PlatformUserBranchResponse(BaseModel):
    id: UUID
    name: str
    avatar_url: str
    routers: int
    vouchers: int
    wallet_balance: int
    wallet_frozen: bool
    created_at: datetime


class PlatformUserRouterResponse(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    name: str
    location: Optional[str]
    is_active: bool
    status: str
    last_seen: Optional[datetime]
    created_at: datetime


class PlatformUserVoucherResponse(BaseModel):
    id: UUID
    voucher_code: str
    router_name: str
    phone_number: str
    profile: str
    amount: int
    status: str
    created_at: datetime
    activated_at: Optional[datetime]
    expires_at: Optional[datetime]


class PlatformUserDetailResponse(BaseModel):
    user: PlatformUserResponse
    branches: list[PlatformUserBranchResponse]
    routers: list[PlatformUserRouterResponse]
    recent_vouchers: list[PlatformUserVoucherResponse]


class PlatformSubadminUpdate(BaseModel):
    role: Optional[str] = Field(default="subadmin", pattern="^(subadmin|none)$")
    permissions: list[str] = Field(default_factory=list)


class PlatformSettingsResponse(BaseModel):
    voucher_fee_type: str
    voucher_fee_value: float
    deposit_fee_percentage: float
    withdrawal_fee_percentage: float
    withdrawal_min_amount: int
    withdrawal_max_amount: int
    voucher_prefix: str
    voucher_prefix_order: str
    telegram_access_alerts: bool


class PlatformSettingsUpdate(BaseModel):
    voucher_fee_type: str = Field(pattern="^(fixed|percentage)$")
    voucher_fee_value: float = Field(ge=0)
    deposit_fee_percentage: float = Field(ge=0, le=100)
    withdrawal_fee_percentage: float = Field(ge=0, le=100)
    withdrawal_min_amount: int = Field(ge=1)
    withdrawal_max_amount: int = Field(ge=1)
    voucher_prefix: str = Field(min_length=0, max_length=20)
    voucher_prefix_order: str = Field(pattern="^(prefix-first|prefix-last)$")
    telegram_access_alerts: bool = False

    @model_validator(mode="after")
    def _check_withdrawal_range(self) -> "PlatformSettingsUpdate":
        if self.withdrawal_min_amount > self.withdrawal_max_amount:
            raise ValueError("withdrawal_min_amount cannot be greater than withdrawal_max_amount")
        return self


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


class PlatformMessageDiagnosticResponse(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    user_id: UUID
    user_name: str
    message: str
    message_type: str
    recipients: list[str]
    status: str
    sent: int
    failed: int
    results: Any
    error: Optional[str]
    cost_per_sms: int
    total_charged: int
    wallet_balance: int
    created_at: datetime
    updated_at: datetime


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


class PlatformLedgerEntryFullResponse(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    user_id: UUID
    owner_name: str
    amount: int
    fee_type: str
    source_amount: int
    fee_rate: float
    reference: Optional[str]
    created_at: datetime


class PlatformAllTransactionResponse(BaseModel):
    id: UUID
    wallet_id: UUID
    branch_id: UUID
    branch_name: str
    owner_name: str
    amount: int
    fee_amount: int
    net_amount: int
    transaction_type: str
    reference: Optional[str]
    status: str
    recipient_phone: Optional[str]
    gateway_status: Optional[str]
    failure_reason: Optional[str]
    created_at: datetime
