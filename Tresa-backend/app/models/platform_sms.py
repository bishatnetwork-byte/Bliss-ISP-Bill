import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class PlatformSmsTransaction(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    admin_id: Optional[_uuid.UUID] = Field(
        default=None,
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    amount: int
    transaction_type: str = Field(index=True)
    reference: Optional[str] = Field(default=None, index=True)
    note: Optional[str] = Field(default=None)
    recipient_phone: Optional[str] = Field(default=None, index=True)
    gateway_reference: Optional[str] = Field(default=None, index=True)
    gateway_status: Optional[str] = Field(default=None)
    failure_reason: Optional[str] = Field(default=None)
    status: str = Field(default="PENDING", index=True)
    last_checked_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
