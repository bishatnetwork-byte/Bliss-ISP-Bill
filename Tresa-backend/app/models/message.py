import uuid as _uuid
from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class MessageLog(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("branch.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    user_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    message: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    message_type: str = Field(default="custom", index=True)
    recipients: Any = Field(default_factory=list, sa_column=sa.Column(sa.JSON, nullable=False))
    status: str = Field(default="sending", index=True)
    sent: int = Field(default=0)
    failed: int = Field(default=0)
    results: Any = Field(default_factory=list, sa_column=sa.Column(sa.JSON, nullable=False))
    error: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text))
    cost_per_sms: int = Field(default=0)
    total_charged: int = Field(default=0)
    wallet_balance: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MessageDraft(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("branch_id", "user_id", name="uq_messagedraft_branch_user"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("branch.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    user_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    message: str = Field(default="", sa_column=sa.Column(sa.Text, nullable=False))
    message_type: str = Field(default="voucher")
    recipients: Any = Field(default_factory=list, sa_column=sa.Column(sa.JSON, nullable=False))
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
