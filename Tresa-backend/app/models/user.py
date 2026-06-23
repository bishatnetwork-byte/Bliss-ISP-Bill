import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    email: str = Field(index=True, unique=True)
    full_name: str
    phone_number: Optional[str] = Field(default=None)
    password_hash: Optional[str] = Field(default=None)
    google_sub: Optional[str] = Field(default=None, index=True, unique=True)
    is_verified: bool = Field(default=False)
    is_active: bool = Field(default=True, index=True)
    allowed_sections: Optional[str] = Field(default=None)
    platform_role: Optional[str] = Field(default=None, index=True)
    platform_permissions: Optional[str] = Field(default=None)
    platform_fee_share_percentage: float = Field(default=0)
    account_subdomain: Optional[str] = Field(default=None, index=True, unique=True)
    subdomain_enabled: bool = Field(default=False, index=True)
    avatar_url: Optional[str] = Field(default=None)
    force_password_change: bool = Field(default=False)
    blocked_until: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
