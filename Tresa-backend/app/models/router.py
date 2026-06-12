import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class Router(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("branch_id", "name", name="uq_router_branch_name"),
        sa.UniqueConstraint("ppp_username", name="uq_router_ppp_username"),
        sa.UniqueConstraint("nat_port", name="uq_router_nat_port"),
        sa.UniqueConstraint("winbox_nat_port", name="uq_router_winbox_nat_port"),
        sa.UniqueConstraint("mac_address", name="uq_router_mac_address"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), sa.ForeignKey("branch.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str = Field(index=True)
    host: str = Field(index=True)
    port: int = Field(default=10269)
    username: str = Field(default="admin")
    password: str = Field(default="admin")
    plaintext_login: bool = Field(default=True)
    location: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    mac_address: Optional[str] = Field(default=None, index=True)
    model: Optional[str] = Field(default=None)
    os_version: Optional[str] = Field(default=None)
    ppp_username: Optional[str] = Field(default=None, index=True)
    ppp_password_encrypted: Optional[str] = Field(default=None)
    tunnel_ip: Optional[str] = Field(default=None, index=True)
    nat_port: Optional[int] = Field(default=None, index=True)
    nat_rule_id: Optional[str] = Field(default=None)
    snmp_nat_rule_id: Optional[str] = Field(default=None)
    winbox_nat_port: Optional[int] = Field(default=None, index=True)
    winbox_nat_rule_id: Optional[str] = Field(default=None)
    api_username: Optional[str] = Field(default=None)
    api_password_encrypted: Optional[str] = Field(default=None)
    trial_enabled: bool = Field(default=False)
    trial_minutes: int = Field(default=30)
    status: str = Field(default="pending", index=True)
    snmp_status: str = Field(default="unknown", index=True)
    snmp_configured: bool = Field(default=False)
    snmp_checked_at: Optional[datetime] = Field(default=None)
    snmp_uptime_seconds: Optional[int] = Field(default=None)
    snmp_error: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text))
    connected_at: Optional[datetime] = Field(default=None)
    disconnected_at: Optional[datetime] = Field(default=None)
    last_seen: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
