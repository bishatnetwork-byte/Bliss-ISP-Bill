import time
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlmodel import Session, select

from app.models.branch_wallet import (
    BranchWallet,
    BranchWalletTransaction,
    SmsWallet,
    SmsWalletTransaction,
)
from app.models.platform_ledger import PlatformLedgerEntry
from app.services import renult_pay


def _gateway_phone(phone_number: str) -> str:
    digits = "".join(ch for ch in phone_number if ch.isdigit())
    if digits.startswith("256") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 10:
        return f"+256{digits[1:]}"
    if digits.startswith("7") and len(digits) == 9:
        return f"+256{digits}"
    return phone_number


def ensure_sms_wallet(session: Session, branch_id: UUID) -> SmsWallet:
    wallet = session.exec(select(SmsWallet).where(SmsWallet.branch_id == branch_id)).first()
    if wallet:
        return wallet
    wallet = SmsWallet(branch_id=branch_id)
    session.add(wallet)
    session.flush()
    return wallet


def get_sms_wallet_for_branch(session: Session, branch_id: UUID) -> SmsWallet:
    wallet = ensure_sms_wallet(session, branch_id)
    session.commit()
    session.refresh(wallet)
    return wallet


def _lock_sms_wallet(session: Session, wallet_id: UUID) -> SmsWallet:
    session.exec(  # type: ignore[call-overload]
        text("SELECT id FROM smswallet WHERE id = :wid FOR UPDATE"),
        params={"wid": str(wallet_id)},
    )
    wallet = session.get(SmsWallet, wallet_id)
    if not wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SMS wallet not found")
    return wallet


def _lock_branch_wallet(session: Session, wallet_id: UUID) -> BranchWallet:
    session.exec(  # type: ignore[call-overload]
        text("SELECT id FROM branchwallet WHERE id = :wid FOR UPDATE"),
        params={"wid": str(wallet_id)},
    )
    wallet = session.get(BranchWallet, wallet_id)
    if not wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch wallet not found")
    return wallet


def list_sms_transactions(
    session: Session,
    sms_wallet_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[SmsWalletTransaction]:
    return list(
        session.exec(
            select(SmsWalletTransaction)
            .where(SmsWalletTransaction.sms_wallet_id == sms_wallet_id)
            .order_by(SmsWalletTransaction.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )


def transfer_from_branch_wallet(
    session: Session,
    branch_wallet_id: UUID,
    sms_wallet_id: UUID,
    amount: int,
    user_id: UUID,
    reference: str | None = None,
) -> tuple[SmsWalletTransaction, SmsWallet]:
    branch_wallet = _lock_branch_wallet(session, branch_wallet_id)
    sms_wallet = _lock_sms_wallet(session, sms_wallet_id)
    if branch_wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Main wallet is frozen")
    if sms_wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "SMS wallet is frozen")
    if branch_wallet.balance < amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Insufficient main wallet balance")

    reference = reference or f"SMS-TRANSFER-{branch_wallet.branch_id}-{int(time.time())}"
    branch_wallet.balance -= amount
    branch_wallet.updated_at = datetime.utcnow()
    branch_txn = BranchWalletTransaction(
        wallet_id=branch_wallet.id,
        branch_id=branch_wallet.branch_id,
        amount=amount,
        fee_amount=0,
        net_amount=amount,
        transaction_type="SMS_WALLET_TRANSFER",
        reference=reference,
    )
    session.add(branch_txn)
    session.flush()

    sms_wallet.balance += amount
    sms_wallet.total_deposited += amount
    sms_wallet.updated_at = datetime.utcnow()
    sms_txn = SmsWalletTransaction(
        sms_wallet_id=sms_wallet.id,
        branch_id=sms_wallet.branch_id,
        amount=amount,
        transaction_type="TRANSFER_IN",
        reference=reference,
        source_wallet_transaction_id=branch_txn.id,
    )
    session.add(sms_txn)
    session.add(branch_wallet)
    session.add(sms_wallet)
    session.commit()
    session.refresh(sms_txn)
    session.refresh(sms_wallet)
    return sms_txn, sms_wallet


def initiate_mobile_money_topup(
    session: Session,
    sms_wallet_id: UUID,
    amount: int,
    phone_number: str,
) -> tuple[SmsWalletTransaction, SmsWallet]:
    sms_wallet = _lock_sms_wallet(session, sms_wallet_id)
    if sms_wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "SMS wallet is frozen")

    reference = uuid4()
    txn = SmsWalletTransaction(
        sms_wallet_id=sms_wallet.id,
        branch_id=sms_wallet.branch_id,
        amount=amount,
        transaction_type="MOBILE_MONEY_TOPUP",
        reference=str(reference),
        status="PENDING",
        phone_number=phone_number,
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)

    try:
        response = renult_pay.initialize_collection(
            amount=amount,
            phone_number=_gateway_phone(phone_number),
            reference=reference,
            description="Renult SMS wallet top up",
        )
    except renult_pay.RenultPayError as exc:
        txn.status = "FAILED"
        txn.failure_reason = str(exc)
        session.add(txn)
        session.commit()
        session.refresh(txn)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Mobile money top-up failed: {exc}") from exc

    txn.gateway_reference = renult_pay.extract_collection_uuid(response)
    txn.gateway_status = renult_pay.extract_status(response)
    normalized = renult_pay.normalize_status(txn.gateway_status)
    if normalized == "FAILED":
        txn.status = "FAILED"
        txn.failure_reason = "The payment gateway rejected this collection"
    elif normalized == "SUCCESS":
        _credit_successful_topup(session, txn, sms_wallet, gateway_payload=response)
        return txn, sms_wallet
    else:
        txn.status = "PENDING"
    session.add(txn)
    session.commit()
    session.refresh(txn)
    session.refresh(sms_wallet)
    return txn, sms_wallet


def verify_mobile_money_topup(
    session: Session,
    transaction_id: UUID,
) -> tuple[SmsWalletTransaction, SmsWallet]:
    txn = session.get(SmsWalletTransaction, transaction_id)
    if not txn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SMS wallet transaction not found")
    sms_wallet = _lock_sms_wallet(session, txn.sms_wallet_id)
    if txn.status != "PENDING" or not txn.gateway_reference:
        return txn, sms_wallet

    try:
        response = renult_pay.verify_collection(txn.gateway_reference)
    except renult_pay.RenultPayError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not verify top-up: {exc}") from exc

    txn.gateway_status = renult_pay.extract_status(response)
    txn.last_checked_at = datetime.utcnow()
    normalized = renult_pay.normalize_status(txn.gateway_status)
    if normalized == "SUCCESS":
        _credit_successful_topup(session, txn, sms_wallet, gateway_payload=response)
    elif normalized == "FAILED":
        txn.status = "FAILED"
        txn.failure_reason = "The payment gateway reported this top-up failed"
        session.add(txn)
        session.commit()
    else:
        session.add(txn)
        session.commit()
    session.refresh(txn)
    session.refresh(sms_wallet)
    return txn, sms_wallet


def _credit_successful_topup(
    session: Session,
    txn: SmsWalletTransaction,
    sms_wallet: SmsWallet,
    gateway_payload: dict | None = None,
) -> None:
    if txn.status == "COMPLETED":
        return
    sms_wallet.balance += txn.amount
    sms_wallet.total_deposited += txn.amount
    sms_wallet.updated_at = datetime.utcnow()
    txn.status = "COMPLETED"
    if gateway_payload:
        txn.gateway_status = renult_pay.extract_status(gateway_payload)
        if not txn.gateway_reference:
            txn.gateway_reference = renult_pay.extract_collection_uuid(gateway_payload)
    session.add(sms_wallet)
    session.add(txn)
    session.commit()


def charge_sms(
    session: Session,
    branch_id: UUID,
    user_id: UUID,
    amount: int,
    reference: str,
) -> tuple[bool, int]:
    sms_wallet = session.exec(
        select(SmsWallet)
        .where(SmsWallet.branch_id == branch_id)
        .with_for_update()
    ).first()
    if not sms_wallet or sms_wallet.is_frozen or sms_wallet.balance < amount:
        return False, sms_wallet.balance if sms_wallet else 0

    sms_wallet.balance -= amount
    sms_wallet.total_spent += amount
    sms_wallet.updated_at = datetime.utcnow()
    session.add(
        SmsWalletTransaction(
            sms_wallet_id=sms_wallet.id,
            branch_id=branch_id,
            amount=amount,
            transaction_type="SMS_CHARGE",
            reference=reference,
        )
    )
    branch_wallet = session.exec(select(BranchWallet).where(BranchWallet.branch_id == branch_id)).first()
    if branch_wallet:
        session.add(
            PlatformLedgerEntry(
                branch_wallet_id=branch_wallet.id,
                branch_id=branch_id,
                user_id=user_id,
                amount=amount,
                fee_type="SMS_NOTIFICATION",
                source_amount=amount,
                fee_rate=1,
                reference=reference,
            )
        )
    session.add(sms_wallet)
    session.commit()
    session.refresh(sms_wallet)
    return True, sms_wallet.balance
