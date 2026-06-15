import uuid as _uuid
from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class PlatformSetting(SQLModel, table=True):
    key: str = Field(primary_key=True, max_length=120)
    value: Any = Field(default=None, sa_column=sa.Column(sa.JSON, nullable=True))
    updated_by: Optional[_uuid.UUID] = Field(
        default=None,
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PlatformAuditLog(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    actor_id: Optional[_uuid.UUID] = Field(
        default=None,
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    action: str = Field(index=True)
    target_type: str = Field(index=True)
    target_id: Optional[str] = Field(default=None, index=True)
    details: Any = Field(default=None, sa_column=sa.Column(sa.JSON, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class VoucherActivationAudit(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    voucher_id: Optional[_uuid.UUID] = Field(
        default=None,
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("voucherpurchase.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    voucher_code: str = Field(index=True)
    router_name: str = Field(index=True)
    event: str = Field(index=True)
    previous_status: Optional[str] = None
    new_status: str
    activated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    metadata_json: Any = Field(default=None, sa_column=sa.Column(sa.JSON, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
