"""
Wallet service — all balance mutations go through here.

Race-condition safety: every deposit/withdraw acquires a row-level lock
(SELECT … FOR UPDATE) on the BranchWallet row before reading the balance.
"""

import math
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
import sqlalchemy as sa
from sqlalchemy import func, text
from sqlmodel import Session, select

from app.models.branch import Branch
from app.models.branch_wallet import BranchWallet, BranchWalletTransaction
from app.models.platform_ledger import PlatformLedgerEntry
from app.models.user import User
from app.services.platform_admin import get_setting

# ── Fee rates ─────────────────────────────────────────────────────────
DEPOSIT_FEE_RATE = 0.01   # 1 %
WITHDRAW_FEE_RATE = 0.02  # 2 %

# The payment gateway only accepts disbursements within this range (UGX).
WITHDRAW_MIN_AMOUNT = 500
WITHDRAW_MAX_AMOUNT = 10_000_000


# ── Helpers ───────────────────────────────────────────────────────────

def _lock_wallet(session: Session, wallet_id: UUID) -> BranchWallet:
    """Acquire a row-level lock then return the freshest state."""
    session.exec(  # type: ignore[call-overload]
        text("SELECT id FROM branchwallet WHERE id = :wid FOR UPDATE"),
        params={"wid": str(wallet_id)},
    )
    wallet = session.get(BranchWallet, wallet_id)
    if not wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Wallet not found")
    return wallet


def _calc_fee(amount: int, rate: float) -> int:
    """Always round fee UP so the platform never loses a fractional cent."""
    return math.ceil(amount * rate)


def _fee_rate(session: Session, key: str, fallback: float) -> float:
    percentage = float(get_setting(session, key, fallback * 100))
    return percentage / 100


def withdrawal_net_amount(amount: int, session: Session) -> int:
    """The amount the recipient actually receives after the withdrawal fee."""
    return amount - _calc_fee(amount, _fee_rate(session, "withdrawal_fee_percentage", WITHDRAW_FEE_RATE))


def withdrawal_fee_rate(session: Session) -> float:
    """Admin-configurable withdrawal fee as a decimal (e.g. 0.02 = 2%)."""
    return _fee_rate(session, "withdrawal_fee_percentage", WITHDRAW_FEE_RATE)


def withdrawal_min_amount(session: Session) -> int:
    """Admin-configurable floor on the net payout, in UGX."""
    return int(get_setting(session, "withdrawal_min_amount", WITHDRAW_MIN_AMOUNT))


def withdrawal_max_amount(session: Session) -> int:
    """Admin-configurable ceiling on the net payout, in UGX (gateway limit by default)."""
    return int(get_setting(session, "withdrawal_max_amount", WITHDRAW_MAX_AMOUNT))


def validate_withdrawal(session: Session, wallet_id: UUID, amount: int) -> BranchWallet:
    """Lock the wallet and check it can cover this withdrawal, without mutating it.

    Used to pre-flight a withdrawal before money is sent through the payment
    gateway, so a frozen wallet or insufficient balance is caught before any
    real money moves. The row-level lock is held for the rest of the
    transaction, so a subsequent `withdraw()` call sees a consistent balance.
    """
    wallet = _lock_wallet(session, wallet_id)
    if wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wallet is frozen")
    if wallet.balance < amount:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Insufficient balance ({wallet.balance}) for withdrawal ({amount})",
        )
    return wallet


def _get_branch_name(session: Session, branch_id: UUID) -> str:
    branch = session.get(Branch, branch_id)
    return branch.name if branch else "Unknown"


def _owner_of_branch(session: Session, branch_id: UUID) -> UUID:
    branch = session.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    return branch.user_id


# ── Core operations ──────────────────────────────────────────────────

def ensure_wallet(session: Session, branch_id: UUID) -> BranchWallet:
    """Get-or-create a wallet for the given branch."""
    wallet = session.exec(
        select(BranchWallet).where(BranchWallet.branch_id == branch_id)
    ).first()
    if wallet:
        return wallet
    wallet = BranchWallet(branch_id=branch_id)
    session.add(wallet)
    session.flush()
    return wallet


def deposit(
    session: Session,
    wallet_id: UUID,
    amount: int,
    user_id: UUID,
    reference: str | None = None,
    fee_amount_override: int | None = None,
    fee_type: str = "DEPOSIT_FEE",
) -> tuple[BranchWalletTransaction, BranchWallet]:
    wallet = _lock_wallet(session, wallet_id)
    if wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wallet is frozen")

    fee_rate = _fee_rate(session, "deposit_fee_percentage", DEPOSIT_FEE_RATE)
    fee = fee_amount_override if fee_amount_override is not None else _calc_fee(amount, fee_rate)
    fee = max(0, min(amount, fee))
    net = amount - fee

    wallet.balance += net
    wallet.total_deposited += amount
    wallet.total_fees_paid += fee
    wallet.updated_at = datetime.utcnow()

    txn = BranchWalletTransaction(
        wallet_id=wallet.id,
        branch_id=wallet.branch_id,
        amount=amount,
        fee_amount=fee,
        net_amount=net,
        transaction_type="DEPOSIT",
        reference=reference,
    )
    session.add(txn)

    ledger = PlatformLedgerEntry(
        branch_wallet_id=wallet.id,
        branch_id=wallet.branch_id,
        user_id=user_id,
        amount=fee,
        fee_type=fee_type,
        source_amount=amount,
        fee_rate=(fee / amount) if amount else 0,
        reference=reference,
    )
    session.add(ledger)

    session.add(wallet)
    session.commit()
    session.refresh(txn)
    session.refresh(wallet)
    return txn, wallet


def withdraw(
    session: Session,
    wallet_id: UUID,
    amount: int,
    user_id: UUID,
    reference: str | None = None,
) -> tuple[BranchWalletTransaction, BranchWallet]:
    wallet = _lock_wallet(session, wallet_id)
    if wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wallet is frozen")

    fee_rate = _fee_rate(session, "withdrawal_fee_percentage", WITHDRAW_FEE_RATE)
    fee = _calc_fee(amount, fee_rate)

    if wallet.balance < amount:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Insufficient balance ({wallet.balance}) for withdrawal ({amount})",
        )

    net = amount - fee  # what the client actually receives

    wallet.balance -= amount
    wallet.total_withdrawn += amount
    wallet.total_fees_paid += fee
    wallet.updated_at = datetime.utcnow()

    txn = BranchWalletTransaction(
        wallet_id=wallet.id,
        branch_id=wallet.branch_id,
        amount=amount,
        fee_amount=fee,
        net_amount=net,
        transaction_type="WITHDRAWAL",
        reference=reference,
    )
    session.add(txn)

    ledger = PlatformLedgerEntry(
        branch_wallet_id=wallet.id,
        branch_id=wallet.branch_id,
        user_id=user_id,
        amount=fee,
        fee_type="WITHDRAWAL_FEE",
        source_amount=amount,
        fee_rate=fee_rate,
        reference=reference,
    )
    session.add(ledger)

    session.add(wallet)
    session.commit()
    session.refresh(txn)
    session.refresh(wallet)
    return txn, wallet


# ── Read helpers ─────────────────────────────────────────────────────

def get_wallet_for_branch(session: Session, branch_id: UUID) -> BranchWallet:
    wallet = session.exec(
        select(BranchWallet).where(BranchWallet.branch_id == branch_id)
    ).first()
    if wallet:
        return wallet
    wallet = ensure_wallet(session, branch_id)
    session.commit()
    session.refresh(wallet)
    return wallet


def list_transactions(
    session: Session,
    wallet_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[BranchWalletTransaction]:
    return list(
        session.exec(
            select(BranchWalletTransaction)
            .where(BranchWalletTransaction.wallet_id == wallet_id)
            .order_by(BranchWalletTransaction.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )


def get_user_wallets(session: Session, user_id: UUID) -> list[tuple[BranchWallet, str]]:
    """Return all wallets for branches owned by this user, with branch names."""
    results = session.exec(
        select(BranchWallet, Branch.name)
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .where(Branch.user_id == user_id)
    ).all()
    return list(results)


# ── Platform admin ───────────────────────────────────────────────────

def platform_summary(session: Session, user_id: UUID) -> dict:
    total_commission = session.exec(
        select(func.coalesce(func.sum(PlatformLedgerEntry.amount), 0))
        .join(Branch, PlatformLedgerEntry.branch_id == Branch.id)
        .where(Branch.user_id == user_id)
    ).one()
    totals = session.exec(
        select(
            func.coalesce(func.sum(BranchWallet.balance), 0),
            func.coalesce(func.sum(BranchWallet.total_deposited), 0),
            func.coalesce(func.sum(BranchWallet.total_withdrawn), 0),
            func.count(BranchWallet.id),
            func.coalesce(func.sum(sa.case((BranchWallet.is_frozen.is_(True), 1), else_=0)), 0),
        )
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .where(Branch.user_id == user_id)
    ).one()
    return {
        "total_commission": int(total_commission),
        "total_balance": int(totals[0]),
        "total_deposited": int(totals[1]),
        "total_withdrawn": int(totals[2]),
        "total_fees_collected": int(total_commission),
        "total_wallets": int(totals[3]),
        "frozen_wallets": int(totals[4]),
    }


def all_client_wallets(session: Session, user_id: UUID) -> list[dict]:
    """Group every branch wallet by owning user."""
    rows = session.exec(
        select(BranchWallet, Branch, User)
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .join(User, Branch.user_id == User.id)
        .where(User.id == user_id)
    ).all()

    users: dict[UUID, dict] = {}
    for wallet, branch, user in rows:
        if user.id not in users:
            users[user.id] = {
                "user_id": user.id,
                "user_name": user.full_name,
                "user_email": user.email,
                "wallets": [],
                "total_balance": 0,
            }
        users[user.id]["wallets"].append({
            "id": wallet.id,
            "branch_id": branch.id,
            "branch_name": branch.name,
            "balance": wallet.balance,
            "total_deposited": wallet.total_deposited,
            "total_withdrawn": wallet.total_withdrawn,
            "total_fees_paid": wallet.total_fees_paid,
            "is_frozen": wallet.is_frozen,
        })
        users[user.id]["total_balance"] += wallet.balance

    return list(users.values())


def client_wallets_for_user(session: Session, target_user_id: UUID) -> dict | None:
    rows = session.exec(
        select(BranchWallet, Branch, User)
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .join(User, Branch.user_id == User.id)
        .where(User.id == target_user_id)
    ).all()
    if not rows:
        return None
    result: dict | None = None
    for wallet, branch, user in rows:
        if result is None:
            result = {
                "user_id": user.id,
                "user_name": user.full_name,
                "user_email": user.email,
                "wallets": [],
                "total_balance": 0,
            }
        result["wallets"].append({
            "id": wallet.id,
            "branch_id": branch.id,
            "branch_name": branch.name,
            "balance": wallet.balance,
            "total_deposited": wallet.total_deposited,
            "total_withdrawn": wallet.total_withdrawn,
            "total_fees_paid": wallet.total_fees_paid,
            "is_frozen": wallet.is_frozen,
        })
        result["total_balance"] += wallet.balance
    return result


def assert_wallet_owner(session: Session, wallet_id: UUID, user_id: UUID) -> BranchWallet:
    wallet = session.exec(
        select(BranchWallet)
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .where(BranchWallet.id == wallet_id)
        .where(Branch.user_id == user_id)
    ).first()
    if not wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Wallet not found or access denied")
    return wallet


def freeze_wallet(session: Session, wallet_id: UUID, frozen: bool) -> BranchWallet:
    wallet = _lock_wallet(session, wallet_id)
    wallet.is_frozen = frozen
    wallet.updated_at = datetime.utcnow()
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    return wallet
