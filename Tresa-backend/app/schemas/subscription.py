from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SubscriptionBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: Optional[str] = Field(default=None, max_length=120)
    category: str = Field(default="General", min_length=1, max_length=80)
    amount: float = Field(default=0, ge=0)
    currency: str = Field(default="UGX", min_length=1, max_length=8)
    due_date: date
    alert_days_before: int = Field(default=3, ge=0, le=60)
    notify_in_app: bool = True
    notify_email: bool = False
    notify_sms: bool = False
    sms_phone: Optional[str] = Field(default=None, max_length=30)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    provider: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, min_length=1, max_length=80)
    amount: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=1, max_length=8)
    due_date: Optional[date] = None
    alert_days_before: Optional[int] = Field(default=None, ge=0, le=60)
    notify_in_app: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_sms: Optional[bool] = None
    sms_phone: Optional[str] = Field(default=None, max_length=30)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


class SubscriptionResponse(SubscriptionBase):
    id: UUID
    user_id: UUID
    days_until_due: int
    reminder_due: bool
    last_notified_on: Optional[date]
    created_at: datetime
    updated_at: datetime
