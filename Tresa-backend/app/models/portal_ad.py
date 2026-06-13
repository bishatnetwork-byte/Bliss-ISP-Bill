import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class PortalAd(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    router_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("router.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    enabled: bool = Field(default=True)
    advertiser_name: str = Field(default="")
    business_type: str = Field(default="other")
    placement: str = Field(default="banner")
    media_type: str = Field(default="image")
    title: str = Field(default="Sponsored")
    description: str = Field(default="")
    media_url: Optional[str] = Field(default=None)
    target_url: Optional[str] = Field(default=None)
    duration_seconds: int = Field(default=5)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
