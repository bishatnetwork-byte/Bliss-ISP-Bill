import uuid as _uuid
from datetime import date, datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class UserSubscription(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    user_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str = Field(index=True)
    provider: Optional[str] = Field(default=None)
    category: str = Field(default="General", index=True)
    amount: float = Field(default=0)
    currency: str = Field(default="UGX", max_length=8)
    due_date: date = Field(sa_column=sa.Column(sa.Date, nullable=False, index=True))
    alert_days_before: int = Field(default=3)
    notify_in_app: bool = Field(default=True)
    notify_email: bool = Field(default=False)
    notify_sms: bool = Field(default=False)
    sms_phone: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    last_notified_on: Optional[date] = Field(default=None, sa_column=sa.Column(sa.Date, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
