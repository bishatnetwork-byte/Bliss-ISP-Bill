from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────

class DepositRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in smallest currency unit")
    reference: Optional[str] = None


class WithdrawalChallengeRequest(BaseModel):
    amount: int = Field(gt=0)
    recipient_phone: str = Field(min_length=10, max_length=20)
    recipient_name: str = Field(min_length=1, max_length=150)
    provider: str = Field(min_length=1, max_length=80)


class WithdrawalChallengeResponse(BaseModel):
    challenge_id: UUID
    expires_at: datetime
    email_hint: str


class WithdrawalConfirmRequest(BaseModel):
    challenge_id: UUID
    code: str = Field(pattern=r"^\d{6}$")


class WithdrawalPasscodeConfirmRequest(BaseModel):
    amount: int = Field(gt=0)
    recipient_phone: str = Field(min_length=10, max_length=20)
    recipient_name: str = Field(min_length=1, max_length=150)
    provider: str = Field(min_length=1, max_length=80)
    passcode: str = Field(pattern=r"^\d{4}$")


class WithdrawalPasscodeSetRequest(BaseModel):
    passcode: str = Field(pattern=r"^\d{4}$")


class WithdrawalMethodRequest(BaseModel):
    method: str = Field(pattern=r"^(email|passcode)$")


# ── Responses ─────────────────────────────────────────────────────────

class BranchWalletResponse(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    balance: int
    total_deposited: int
    total_withdrawn: int
    total_fees_paid: int
    is_frozen: bool
    created_at: datetime
    updated_at: datetime


class WalletTransactionResponse(BaseModel):
    id: UUID
    wallet_id: UUID
    branch_id: UUID
    amount: int
    fee_amount: int
    net_amount: int
    transaction_type: str
    reference: Optional[str]
    status: str
    recipient_phone: Optional[str] = None
    gateway_status: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: datetime


class DepositWithdrawResponse(BaseModel):
    transaction: WalletTransactionResponse
    wallet: BranchWalletResponse


class WithdrawalConfirmResponse(DepositWithdrawResponse):
    receipt_email_sent: bool


class WithdrawalConfigResponse(BaseModel):
    fee_rate: float
    min_amount: int
    max_amount: int


class WithdrawalSecurityResponse(BaseModel):
    passcode_enabled: bool
    preferred_method: str
    email_hint: str


class PlatformLedgerEntryResponse(BaseModel):
    id: UUID
    branch_wallet_id: UUID
    branch_id: UUID
    user_id: UUID
    amount: int
    fee_type: str
    source_amount: int
    fee_rate: float
    reference: Optional[str]
    created_at: datetime


class PlatformSummaryResponse(BaseModel):
    total_commission: int
    total_balance: int
    total_deposited: int
    total_withdrawn: int
    total_fees_collected: int
    total_wallets: int
    frozen_wallets: int


class ClientBranchWallet(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    balance: int
    total_deposited: int
    total_withdrawn: int
    total_fees_paid: int
    is_frozen: bool


class ClientWalletSummary(BaseModel):
    user_id: UUID
    user_name: str
    user_email: str
    wallets: list[ClientBranchWallet]
    total_balance: int
