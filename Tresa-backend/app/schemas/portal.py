from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CaptivePortalUpsert(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=500)
    phone_one: Optional[str] = Field(default=None, max_length=30)
    phone_two: Optional[str] = Field(default=None, max_length=30)
    logo_url: Optional[str] = Field(default=None, max_length=1000)
    primary_color: Optional[str] = Field(default=None, max_length=9)
    portal_template: str = Field(default="renault", min_length=1, max_length=80)


class CaptivePortalPushRequest(BaseModel):
    ftp_username: Optional[str] = Field(default=None, min_length=1, max_length=120)
    ftp_password: Optional[str] = Field(default=None, min_length=1, max_length=255)
    ftp_port: Optional[int] = Field(default=None, ge=1, le=65535)


class CaptivePortalResponse(BaseModel):
    id: Optional[UUID] = None
    router_id: Optional[UUID] = None
    router_name: str
    title: str
    description: str
    phone_one: Optional[str] = None
    phone_two: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    portal_template: str = "renault"
    last_pushed_at: Optional[datetime] = None


class PortalPaymentCreate(BaseModel):
    phone_number: str = Field(min_length=5, max_length=30)
    package_id: int
    buy_for: str = Field(default="self", max_length=40)


class PortalVoucherResponse(BaseModel):
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


class PortalPaymentInitResponse(BaseModel):
    success: bool
    reference: UUID
    status: str
    message: Optional[str] = None


class PortalPaymentStatusResponse(BaseModel):
    success: bool
    status: str
    voucher: Optional[PortalVoucherResponse] = None
    message: Optional[str] = None


class PortalFindVoucherResponse(BaseModel):
    success: bool
    vouchers: list[PortalVoucherResponse]


class PushCaptiveResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    pushed_files: list[str]
    deployed_directory: Optional[str] = None
    updated_profiles: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    diagnostics: dict[str, str] = Field(default_factory=dict)


class CaptivePortalDeployResponse(BaseModel):
    success: bool
    router_id: UUID
    router_name: str
    fetched_files: list[str]
    deployed_directory: Optional[str] = None
    updated_profiles: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    diagnostics: dict[str, str] = Field(default_factory=dict)
