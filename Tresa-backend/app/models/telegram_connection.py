import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class TelegramConnection(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("user_id", name="uq_telegramconnection_user"),
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
    bot_token_encrypted: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    bot_username: str
    chat_id: str = Field(index=True)
    chat_title: Optional[str] = Field(default=None)
    secondary_chat_id: Optional[str] = Field(default=None, index=True)
    secondary_chat_title: Optional[str] = Field(default=None)
    voucher_purchases: bool = Field(default=True)
    voucher_batches: bool = Field(default=True)
    withdrawal_receipts: bool = Field(default=True)
    router_alerts: bool = Field(default=True)
    hourly_router_ping: bool = Field(default=True)
    connected_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
