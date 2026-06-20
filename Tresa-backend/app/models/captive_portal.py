import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class CaptivePortal(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("router_id", name="uq_captive_portal_router_id"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    router_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("router.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    router_name: str = Field(index=True)
    title: str = Field(default="Renault WIFI")
    description: str = Field(default="High-speed internet access portal")
    phone_one: Optional[str] = Field(default=None)
    phone_two: Optional[str] = Field(default=None)
    logo_url: Optional[str] = Field(default=None)
    primary_color: Optional[str] = Field(default=None)
    portal_template: str = Field(default="renault")
    last_pushed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
