from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class VoucherPackageResponse(BaseModel):
    id: int
    package_id: int
    limit: str
    devices: str
    data: str
    profile: str
    total: str
    router_id: str
    priority: int
    speed_type: str
    rate_limit: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RouterPackagesDataResponse(BaseModel):
    voucher: list[VoucherPackageResponse]


class RouterPackagesResponse(BaseModel):
    success: bool
    data: RouterPackagesDataResponse


class RouterPackageCreate(BaseModel):
    limit: str = Field(min_length=1, max_length=80)
    devices: str = Field(default="1", min_length=1, max_length=20)
    data: str = Field(min_length=1, max_length=160)
    profile: str = Field(min_length=1, max_length=80)
    total: str = Field(min_length=1, max_length=40)
    priority: int = 0
    speed_type: str = Field(default="Standard", min_length=1, max_length=80)
    rate_limit: Optional[str] = Field(default=None, max_length=80)


class RouterPackageUpdate(BaseModel):
    limit: Optional[str] = Field(default=None, min_length=1, max_length=80)
    devices: Optional[str] = Field(default=None, min_length=1, max_length=20)
    data: Optional[str] = Field(default=None, min_length=1, max_length=160)
    profile: Optional[str] = Field(default=None, min_length=1, max_length=80)
    total: Optional[str] = Field(default=None, min_length=1, max_length=40)
    priority: Optional[int] = None
    speed_type: Optional[str] = Field(default=None, min_length=1, max_length=80)
    rate_limit: Optional[str] = Field(default=None, max_length=80)


class RouterPackageMutationResponse(BaseModel):
    success: bool
    package: VoucherPackageResponse
    router_sync_error: Optional[str] = None


class RouterPackageSyncResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    imported: int
    packages: list[VoucherPackageResponse]
    error: Optional[str] = None


class VoucherBatchCreate(BaseModel):
    package_id: int
    quantity: int = Field(default=1, ge=1, le=1000)
    amount: Optional[int] = Field(default=None, ge=0)
    phone_number: Optional[str] = Field(default=None, max_length=30)
    prefix: str = Field(default="", max_length=20)
    postfix: str = Field(default="", max_length=20)
    code_length: int = Field(default=8, ge=4, le=16)
    code_format: str = Field(default="alphanumeric-upper", max_length=40)
    payment_reference: Optional[str] = Field(default=None, max_length=120)


class VoucherBatchItemResponse(BaseModel):
    id: UUID
    router_name: str
    phone_number: str
    voucher_code: str
    package_id: int
    profile: str
    speed_type: str
    amount: int
    devices: str
    data: str
    status: str
    payment_reference: Optional[str]
    created_at: datetime
    activated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class VoucherBatchResponse(BaseModel):
    success: bool
    count: int
    vouchers: list[VoucherBatchItemResponse]
    router_sync_error: Optional[str] = None


class VoucherJobCreatedResponse(BaseModel):
    job_id: UUID
    status: str


class VoucherJobResponse(BaseModel):
    id: UUID
    router_id: UUID
    status: str
    stage: str
    progress: int
    message: str
    events: list[dict]
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class VoucherListResponse(BaseModel):
    success: bool
    total: int
    vouchers: list[VoucherBatchItemResponse]


class VoucherCustomerInsight(BaseModel):
    phone_number: str
    purchases: int
    total_amount: int
    last_purchase_at: datetime
    segment: str


class VoucherSupportSummaryResponse(BaseModel):
    success: bool
    total_vouchers: int
    total_amount: int
    active_vouchers: int
    top_customers: list[VoucherCustomerInsight]
    low_customers: list[VoucherCustomerInsight]
    rare_customers: list[VoucherCustomerInsight]


class VoucherRouterSyncResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    imported: int = 0
    updated: int = 0
    synced: int = 0
    failed: int = 0
    errors: list[str] = Field(default_factory=list)


class VoucherExpiryCheckResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    checked: int
    expired: int


class VoucherDeleteResponse(BaseModel):
    success: bool
    deleted: int
    router_deleted: int = 0
    errors: list[str] = Field(default_factory=list)
