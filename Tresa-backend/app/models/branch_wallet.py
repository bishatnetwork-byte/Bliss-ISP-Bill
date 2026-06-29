import uuid as _uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlmodel import Field, SQLModel


class BranchWallet(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("branch_id", name="uq_branchwallet_branch"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("branch.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
    )
    balance: int = Field(default=0)
    total_deposited: int = Field(default=0)
    total_withdrawn: int = Field(default=0)
    total_fees_paid: int = Field(default=0)
    is_frozen: bool = Field(default=False)
    withdrawal_passcode_hash: Optional[str] = Field(default=None)
    withdrawal_method: str = Field(default="email", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BranchWalletTransaction(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    wallet_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("branchwallet.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), nullable=False, index=True),
    )
    amount: int
    fee_amount: int = Field(default=0)
    net_amount: int = Field(default=0)
    transaction_type: str = Field(index=True)  # DEPOSIT | WITHDRAWAL
    reference: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="COMPLETED", index=True)
    recipient_phone: Optional[str] = Field(default=None)
    gateway_reference: Optional[str] = Field(default=None, index=True)
    gateway_status: Optional[str] = Field(default=None)
    failure_reason: Optional[str] = Field(default=None)
    last_checked_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SmsWallet(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("branch_id", name="uq_smswallet_branch"),
    )

    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("branch.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
    )
    balance: int = Field(default=0)
    total_deposited: int = Field(default=0)
    total_spent: int = Field(default=0)
    is_frozen: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SmsWalletTransaction(SQLModel, table=True):
    id: _uuid.UUID = Field(
        default_factory=_uuid.uuid4,
        sa_column=sa.Column(PgUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4),
    )
    sms_wallet_id: _uuid.UUID = Field(
        sa_column=sa.Column(
            PgUUID(as_uuid=True),
            sa.ForeignKey("smswallet.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    branch_id: _uuid.UUID = Field(
        sa_column=sa.Column(PgUUID(as_uuid=True), nullable=False, index=True),
    )
    amount: int
    transaction_type: str = Field(index=True)
    reference: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="COMPLETED", index=True)
    source_wallet_transaction_id: Optional[_uuid.UUID] = Field(
        default=None,
        sa_column=sa.Column(PgUUID(as_uuid=True), nullable=True, index=True),
    )
    phone_number: Optional[str] = Field(default=None)
    gateway_reference: Optional[str] = Field(default=None, index=True)
    gateway_status: Optional[str] = Field(default=None)
    failure_reason: Optional[str] = Field(default=None)
    last_checked_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
