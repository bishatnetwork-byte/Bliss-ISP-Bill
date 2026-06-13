import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class PortalAdEvent(SQLModel, table=True):
    __tablename__ = "portal_ad_event"
    __table_args__ = (
        sa.Index("ix_portal_ad_event_ad_type_created", "ad_id", "event_type", "created_at"),
        sa.Index("ix_portal_ad_event_router_created", "router_id", "created_at"),
        sa.Index("ix_portal_ad_event_unique_view", "ad_id", "ip_hash", "event_type", "created_at"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    ad_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("portalad.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    router_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("router.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    event_type: str = Field(index=True)
    ip_hash: str = Field(index=True)
    visitor_hash: str = Field(index=True)
    country: Optional[str] = Field(default=None, index=True)
    region: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    user_agent: Optional[str] = Field(default=None)
    referrer: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
