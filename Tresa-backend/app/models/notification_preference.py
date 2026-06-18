import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class NotificationPreference(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("user_id", name="uq_notificationpreference_user"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    user_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
    )
    email_router_alerts: bool = Field(default=True)
    sms_router_alerts: bool = Field(default=False)
    sms_phone_number: Optional[str] = Field(default=None)
    bulk_sms_voucher_enabled: bool = Field(default=False)
    bulk_sms_low_balance_enabled: bool = Field(default=False)
    bulk_sms_low_balance_threshold: int = Field(default=1000)
    bulk_sms_admin_buy_for_enabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
