"""Wallet API routes branch wallets & platform admin views."""

import hmac
import logging
import secrets
from datetime import datetime, timedelta
from html import escape
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.deps import CurrentUser
from app.core.config import settings
from app.db.session import SessionDep, engine
from app.models.branch import Branch
from app.models.branch_wallet import BranchWallet, BranchWalletTransaction
from app.models.withdrawal_challenge import WithdrawalChallenge
from app.schemas.auth import MessageResponse
from app.schemas.wallet import (
    BranchWalletResponse,
    ClientWalletSummary,
    DepositRequest,
    DepositWithdrawResponse,
    PlatformSummaryResponse,
    WalletTransactionResponse,
    WithdrawalChallengeRequest,
    WithdrawalChallengeResponse,
    WithdrawalConfirmRequest,
    WithdrawalConfirmResponse,
    WithdrawalConfigResponse,
    WithdrawalMethodRequest,
    WithdrawalPasscodeConfirmRequest,
    WithdrawalPasscodeSetRequest,
    WithdrawalSecurityResponse,
)
from app.services import renult_pay
from app.services import wallet as wallet_svc
from app.services.email import send_withdrawal_code_email, send_withdrawal_receipt_email
from app.services.portal import gateway_phone
from app.services.security import hash_code
from app.services.telegram import send_user_event

router = APIRouter(prefix="/wallets", tags=["Wallets"])


@router.post("/debug/send-money", tags=["Debug"], include_in_schema=True)
def debug_send_money(
    phone: str,
    amount: int,
    session: SessionDep,
):
    """NO-AUTH debug endpoint calls send_money directly and returns the raw gateway response or error."""
    from uuid import uuid4
    net = wallet_svc.withdrawal_net_amount(amount, session)
    try:
        resp = renult_pay.send_money(
            amount=net,
            phone_number=gateway_phone(phone),
            reference=uuid4(),
            description="DEBUG send-money test",
        )
        return {"ok": True, "requested_amount": amount, "net_sent": net, "gateway_response": resp}
    except renult_pay.RenultPayError as exc:
        return {"ok": False, "requested_amount": amount, "net_sent": net, "error": str(exc)}


# Minimum time between calls to the gateway's send-money status endpoint for
# a single withdrawal, mirroring `portal.PAYMENT_VERIFY_INTERVAL`.
WITHDRAWAL_VERIFY_INTERVAL = timedelta(seconds=2)

# ── Helpers ───────────────────────────────────────────────────────────


def _assert_branch_owner(session: SessionDep, branch_id: UUID, user_id: UUID) -> Branch:
    branch = session.exec(
        select(Branch).where(Branch.id == branch_id, Branch.user_id == user_id)
    ).first()
    if not branch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found or access denied")
    return branch


def _wallet_response(wallet: BranchWallet, branch_name: str) -> BranchWalletResponse:
    return BranchWalletResponse(
        id=wallet.id,
        branch_id=wallet.branch_id,
        branch_name=branch_name,
        balance=wallet.balance,
        total_deposited=wallet.total_deposited,
        total_withdrawn=wallet.total_withdrawn,
        total_fees_paid=wallet.total_fees_paid,
        is_frozen=wallet.is_frozen,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


def _txn_response(t) -> WalletTransactionResponse:
    return WalletTransactionResponse(
        id=t.id,
        wallet_id=t.wallet_id,
        branch_id=t.branch_id,
        amount=t.amount,
        fee_amount=t.fee_amount,
        net_amount=t.net_amount,
        transaction_type=t.transaction_type.lower(),
        reference=t.reference,
        status=t.status,
        recipient_phone=t.recipient_phone,
        gateway_status=t.gateway_status,
        failure_reason=t.failure_reason,
        created_at=t.created_at,
    )


# ── Branch wallet endpoints ─────────────────────────────────────────


@router.get("/config", response_model=WithdrawalConfigResponse)
def withdrawal_config(_: CurrentUser, session: SessionDep) -> WithdrawalConfigResponse:
    """Return the current withdrawal fee rate and min/max limits."""
    return WithdrawalConfigResponse(
        fee_rate=wallet_svc.withdrawal_fee_rate(session),
        min_amount=wallet_svc.withdrawal_min_amount(session),
        max_amount=wallet_svc.withdrawal_max_amount(session),
    )


@router.get("/my-wallets", response_model=list[BranchWalletResponse])
def my_wallets(user: CurrentUser, session: SessionDep):
    """All wallets for the current user's branches."""
    rows = wallet_svc.get_user_wallets(session, user.id)
    return [_wallet_response(w, name) for w, name in rows]


@router.get("/branch/{branch_id}", response_model=BranchWalletResponse)
def get_branch_wallet(branch_id: UUID, user: CurrentUser, session: SessionDep):
    branch = _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    return _wallet_response(wallet, branch.name)


@router.get("/branch/{branch_id}/transactions", response_model=list[WalletTransactionResponse])
def branch_transactions(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    txns = wallet_svc.list_transactions(session, wallet.id, limit, offset)
    return [_txn_response(t) for t in txns]


@router.post("/branch/{branch_id}/deposit", response_model=DepositWithdrawResponse, status_code=status.HTTP_201_CREATED)
def deposit_to_branch(branch_id: UUID, payload: DepositRequest, user: CurrentUser, session: SessionDep):
    branch = _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    txn, updated_wallet = wallet_svc.deposit(
        session, wallet.id, payload.amount, user.id, payload.reference,
    )
    return DepositWithdrawResponse(
        transaction=_txn_response(txn),
        wallet=_wallet_response(updated_wallet, branch.name),
    )


@router.get("/branch/{branch_id}/withdrawal-security", response_model=WithdrawalSecurityResponse)
def withdrawal_security(branch_id: UUID, user: CurrentUser, session: SessionDep) -> WithdrawalSecurityResponse:
    _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    return _security_response(wallet, user.email)


@router.put("/branch/{branch_id}/withdrawal-method", response_model=WithdrawalSecurityResponse)
def set_withdrawal_method(
    branch_id: UUID,
    payload: WithdrawalMethodRequest,
    user: CurrentUser,
    session: SessionDep,
) -> WithdrawalSecurityResponse:
    _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    if payload.method == "passcode" and not _wallet_passcode_enabled(wallet):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Set a withdrawal passcode before using passcode withdrawals")
    wallet.withdrawal_method = payload.method
    wallet.updated_at = datetime.utcnow()
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    return _security_response(wallet, user.email)


@router.post("/branch/{branch_id}/withdrawal-passcode", response_model=WithdrawalSecurityResponse, status_code=status.HTTP_201_CREATED)
def set_withdrawal_passcode(
    branch_id: UUID,
    payload: WithdrawalPasscodeSetRequest,
    user: CurrentUser,
    session: SessionDep,
) -> WithdrawalSecurityResponse:
    _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    if _wallet_passcode_enabled(wallet):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset your existing passcode by email before setting a new one")
    wallet.withdrawal_passcode_hash = hash_code(_passcode_hash_key(user.email, wallet.id), payload.passcode)
    wallet.withdrawal_method = "passcode"
    wallet.updated_at = datetime.utcnow()
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    return _security_response(wallet, user.email)


@router.delete("/branch/{branch_id}/withdrawal-passcode", response_model=WithdrawalChallengeResponse)
def request_withdrawal_passcode_reset(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> WithdrawalChallengeResponse:
    _assert_branch_owner(session, branch_id, user.id)
    challenge = WithdrawalChallenge(
        user_id=user.id,
        branch_id=branch_id,
        amount=0,
        recipient_phone="PASSCODE_RESET",
        recipient_name="Withdrawal passcode reset",
        provider="EMAIL",
        code_hash="pending",
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(challenge)
    session.flush()
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = hash_code(_challenge_hash_key(user.email, challenge.id), code)
    send_withdrawal_code_email(user.email, user.full_name, code, 0, "withdrawal passcode reset")
    session.add(challenge)
    session.commit()
    return WithdrawalChallengeResponse(
        challenge_id=challenge.id,
        expires_at=challenge.expires_at,
        email_hint=_email_hint(user.email),
    )


@router.post("/branch/{branch_id}/withdrawal-passcode/reset", response_model=WithdrawalSecurityResponse)
def confirm_withdrawal_passcode_reset(
    branch_id: UUID,
    payload: WithdrawalConfirmRequest,
    user: CurrentUser,
    session: SessionDep,
) -> WithdrawalSecurityResponse:
    _assert_branch_owner(session, branch_id, user.id)
    challenge = session.exec(
        select(WithdrawalChallenge)
        .where(WithdrawalChallenge.id == payload.challenge_id)
        .where(WithdrawalChallenge.user_id == user.id)
        .where(WithdrawalChallenge.branch_id == branch_id)
        .with_for_update()
    ).first()
    if not challenge or challenge.used_at is not None or challenge.recipient_phone != "PASSCODE_RESET":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passcode reset challenge is invalid or already used")
    if challenge.expires_at < datetime.utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passcode reset code has expired")
    if challenge.attempts >= 5:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many incorrect verification attempts")
    expected = hash_code(_challenge_hash_key(user.email, challenge.id), payload.code)
    if not hmac.compare_digest(challenge.code_hash, expected):
        challenge.attempts += 1
        session.add(challenge)
        session.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid verification code")

    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    wallet.withdrawal_passcode_hash = None
    wallet.withdrawal_method = "email"
    wallet.updated_at = datetime.utcnow()
    challenge.used_at = datetime.utcnow()
    session.add(wallet)
    session.add(challenge)
    session.commit()
    session.refresh(wallet)
    return _security_response(wallet, user.email)


def _challenge_hash_key(user_email: str, challenge_id: UUID) -> str:
    return f"{user_email}:{challenge_id}"


def _email_hint(email: str) -> str:
    local, domain = email.split("@", 1)
    visible = local[:2]
    return f"{visible}{'*' * max(2, len(local) - len(visible))}@{domain}"


def _passcode_hash_key(user_email: str, wallet_id: UUID) -> str:
    return f"withdrawal-passcode:{user_email}:{wallet_id}"


def _wallet_passcode_enabled(wallet: BranchWallet) -> bool:
    return bool(wallet.withdrawal_passcode_hash)


def _security_response(wallet: BranchWallet, user_email: str) -> WithdrawalSecurityResponse:
    enabled = _wallet_passcode_enabled(wallet)
    preferred = wallet.withdrawal_method if enabled and wallet.withdrawal_method in {"email", "passcode"} else "email"
    return WithdrawalSecurityResponse(
        passcode_enabled=enabled,
        preferred_method=preferred,
        email_hint=_email_hint(user_email),
    )


def _validate_withdrawal_payload(
    session: Session,
    wallet: BranchWallet,
    amount: int,
) -> None:
    if wallet.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wallet is frozen")
    if wallet.balance < amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Insufficient wallet balance")

    net_amount = wallet_svc.withdrawal_net_amount(amount, session)
    min_amount = wallet_svc.withdrawal_min_amount(session)
    max_amount = wallet_svc.withdrawal_max_amount(session)
    if net_amount < min_amount or net_amount > max_amount:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Withdrawal amount must result in a net payout between "
            f"UGX {min_amount:,} and UGX {max_amount:,}",
        )


def _execute_withdrawal(
    *,
    branch: Branch,
    branch_id: UUID,
    amount: int,
    recipient_phone: str,
    recipient_name: str,
    provider: str,
    reference: UUID,
    user: CurrentUser,
    session: SessionDep,
    background_tasks: BackgroundTasks,
) -> WithdrawalConfirmResponse:
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    wallet_svc.validate_withdrawal(session, wallet.id, amount)

    try:
        gateway_response = renult_pay.send_money(
            amount=wallet_svc.withdrawal_net_amount(amount, session),
            phone_number=gateway_phone(recipient_phone),
            reference=reference,
            description=f"Withdrawal payout - {branch.name}"[:255],
        )
    except renult_pay.RenultPayError as exc:
        logger.error(
            "send_money failed [branch=%s reference=%s phone=%s amount=%s]: %s",
            branch_id, reference, recipient_phone,
            wallet_svc.withdrawal_net_amount(amount, session), exc,
        )
        session.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Payment could not be sent: {exc}")

    gateway_status = renult_pay.extract_status(gateway_response)
    normalized_status = renult_pay.normalize_status(gateway_status)
    if normalized_status == "FAILED":
        session.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Payment gateway declined this withdrawal")

    gateway_reference = renult_pay.extract_collection_uuid(gateway_response) or str(reference)
    verified_recipient = renult_pay.extract_recipient_identity_name(gateway_response)

    txn, updated_wallet = wallet_svc.withdraw(
        session,
        wallet.id,
        amount,
        user.id,
        recipient_phone,
    )

    txn.recipient_phone = recipient_phone
    txn.gateway_reference = gateway_reference
    txn.gateway_status = gateway_status
    txn.status = "PROCESSING" if normalized_status == "PENDING" else "COMPLETED"
    txn.last_checked_at = datetime.utcnow()
    session.add(txn)
    session.commit()
    session.refresh(txn)

    background_tasks.add_task(
        _notify_withdrawal_complete,
        user_id=user.id,
        user_email=user.email,
        branch_name=branch.name,
        txn_id=txn.id,
        recipient_name=recipient_name,
        recipient_phone=recipient_phone,
        provider=provider,
        amount=txn.amount,
        fee_amount=txn.fee_amount,
        net_amount=txn.net_amount,
        created_at_iso=txn.created_at.isoformat(),
        verified_recipient_name=verified_recipient,
    )

    return WithdrawalConfirmResponse(
        transaction=_txn_response(txn),
        wallet=_wallet_response(updated_wallet, branch.name),
        receipt_email_sent=bool(settings.resend_key),
    )


@router.post("/branch/{branch_id}/withdrawal-challenges", response_model=WithdrawalChallengeResponse, status_code=status.HTTP_201_CREATED)
def request_withdrawal_challenge(
    branch_id: UUID,
    payload: WithdrawalChallengeRequest,
    user: CurrentUser,
    session: SessionDep,
) -> WithdrawalChallengeResponse:
    _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    _validate_withdrawal_payload(session, wallet, payload.amount)

    recent_count = session.exec(
        select(func.count(WithdrawalChallenge.id))
        .where(WithdrawalChallenge.user_id == user.id)
        .where(WithdrawalChallenge.created_at >= datetime.utcnow() - timedelta(minutes=15))
    ).one()
    if int(recent_count) >= 5:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many verification requests. Try again later.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = WithdrawalChallenge(
        user_id=user.id,
        branch_id=branch_id,
        amount=payload.amount,
        recipient_phone=payload.recipient_phone,
        recipient_name=payload.recipient_name,
        provider=payload.provider,
        code_hash="pending",
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(challenge)
    session.flush()
    challenge.code_hash = hash_code(_challenge_hash_key(user.email, challenge.id), code)
    send_withdrawal_code_email(user.email, user.full_name, code, payload.amount, payload.recipient_phone)
    session.add(challenge)
    session.commit()
    return WithdrawalChallengeResponse(
        challenge_id=challenge.id,
        expires_at=challenge.expires_at,
        email_hint=_email_hint(user.email),
    )


@router.post("/branch/{branch_id}/withdrawal-passcode-confirmations", response_model=WithdrawalConfirmResponse, status_code=status.HTTP_201_CREATED)
def confirm_withdrawal_with_passcode(
    branch_id: UUID,
    payload: WithdrawalPasscodeConfirmRequest,
    user: CurrentUser,
    session: SessionDep,
    background_tasks: BackgroundTasks,
) -> WithdrawalConfirmResponse:
    branch = _assert_branch_owner(session, branch_id, user.id)
    wallet = wallet_svc.get_wallet_for_branch(session, branch_id)
    _validate_withdrawal_payload(session, wallet, payload.amount)
    if not _wallet_passcode_enabled(wallet):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No withdrawal passcode is set for this wallet")
    expected = hash_code(_passcode_hash_key(user.email, wallet.id), payload.passcode)
    if not hmac.compare_digest(wallet.withdrawal_passcode_hash or "", expected):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid withdrawal passcode")

    return _execute_withdrawal(
        branch=branch,
        branch_id=branch_id,
        amount=payload.amount,
        recipient_phone=payload.recipient_phone,
        recipient_name=payload.recipient_name,
        provider=payload.provider,
        reference=uuid4(),
        user=user,
        session=session,
        background_tasks=background_tasks,
    )


@router.post("/branch/{branch_id}/withdrawal-confirmations", response_model=WithdrawalConfirmResponse, status_code=status.HTTP_201_CREATED)
def confirm_withdrawal(
    branch_id: UUID,
    payload: WithdrawalConfirmRequest,
    user: CurrentUser,
    session: SessionDep,
    background_tasks: BackgroundTasks,
) -> WithdrawalConfirmResponse:
    branch = _assert_branch_owner(session, branch_id, user.id)
    challenge = session.exec(
        select(WithdrawalChallenge)
        .where(WithdrawalChallenge.id == payload.challenge_id)
        .where(WithdrawalChallenge.user_id == user.id)
        .where(WithdrawalChallenge.branch_id == branch_id)
        .with_for_update()
    ).first()
    if not challenge or challenge.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Withdrawal challenge is invalid or already used")
    if challenge.expires_at < datetime.utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Withdrawal verification code has expired")
    if challenge.attempts >= 5:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many incorrect verification attempts")

    expected = hash_code(_challenge_hash_key(user.email, challenge.id), payload.code)
    if not hmac.compare_digest(challenge.code_hash, expected):
        challenge.attempts += 1
        session.add(challenge)
        session.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid verification code")

    challenge.used_at = datetime.utcnow()
    session.add(challenge)

    return _execute_withdrawal(
        branch=branch,
        branch_id=branch_id,
        amount=challenge.amount,
        recipient_phone=challenge.recipient_phone,
        recipient_name=challenge.recipient_name,
        provider=challenge.provider,
        reference=challenge.id,
        user=user,
        session=session,
        background_tasks=background_tasks,
    )


def _notify_withdrawal_complete(
    *,
    user_id: UUID,
    user_email: str,
    branch_name: str,
    txn_id: UUID,
    recipient_name: str,
    recipient_phone: str,
    provider: str,
    amount: int,
    fee_amount: int,
    net_amount: int,
    created_at_iso: str,
    verified_recipient_name: str | None,
) -> None:
    """Send the withdrawal receipt email and Telegram notification.

    Runs as a background task after the HTTP response has already been sent,
    using its own DB session since the request-scoped one is gone by then.
    """
    try:
        send_withdrawal_receipt_email(
            user_email,
            str(txn_id),
            recipient_name,
            recipient_phone,
            provider,
            amount,
            fee_amount,
            net_amount,
            created_at_iso,
            branch_name,
        )
    except Exception:
        pass

    with Session(engine) as session:
        send_user_event(
            session,
            user_id,
            "withdrawal",
            (
                "<b>Withdrawal receipt</b>\n"
                f"Branch: {escape(branch_name)}\n"
                f"Recipient: {escape(verified_recipient_name or recipient_name)}\n"
                f"Identity: {'✅ Verified subscriber name' if verified_recipient_name else '⚠️ Name could not be verified'}\n"
                f"Phone: {escape(recipient_phone)}\n"
                f"Provider: {escape(provider)}\n"
                f"Amount: UGX {amount:,}\n"
                f"Fee: UGX {fee_amount:,}\n"
                f"Net: UGX {net_amount:,}\n"
                f"Transaction: <code>{txn_id}</code>"
            ),
        )


@router.get("/branch/{branch_id}/withdrawals/{transaction_id}/status", response_model=WalletTransactionResponse)
def withdrawal_status(
    branch_id: UUID,
    transaction_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> WalletTransactionResponse:
    """Re-check a processing withdrawal's payout status with the gateway."""
    _assert_branch_owner(session, branch_id, user.id)
    txn = session.exec(
        select(BranchWalletTransaction)
        .where(BranchWalletTransaction.id == transaction_id)
        .where(BranchWalletTransaction.branch_id == branch_id)
        .where(BranchWalletTransaction.transaction_type == "WITHDRAWAL")
    ).first()
    if not txn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Withdrawal transaction not found")

    if txn.status != "PROCESSING" or not txn.gateway_reference:
        return _txn_response(txn)

    now = datetime.utcnow()
    if txn.last_checked_at and now - txn.last_checked_at < WITHDRAWAL_VERIFY_INTERVAL:
        return _txn_response(txn)

    try:
        gateway_response = renult_pay.get_send_money_status(txn.gateway_reference)
    except renult_pay.RenultPayError:
        txn.last_checked_at = now
        session.add(txn)
        session.commit()
        session.refresh(txn)
        return _txn_response(txn)

    gateway_status = renult_pay.extract_status(gateway_response)
    normalized_status = renult_pay.normalize_status(gateway_status)
    txn.gateway_status = gateway_status
    txn.last_checked_at = now

    if normalized_status == "SUCCESS":
        txn.status = "COMPLETED"
    elif normalized_status == "FAILED":
        txn.status = "FAILED"
        txn.failure_reason = "The payment gateway reported this payout failed. Contact support."

    session.add(txn)
    session.commit()
    session.refresh(txn)
    return _txn_response(txn)


# ── Platform admin endpoints ────────────────────────────────────────
# TODO: Replace with proper superadmin role check when available.
# For now, any authenticated user can access (protect behind env flag later).


@router.get("/platform/summary", response_model=PlatformSummaryResponse)
def platform_summary(user: CurrentUser, session: SessionDep):
    data = wallet_svc.platform_summary(session, user.id)
    return PlatformSummaryResponse(**data)


@router.get("/platform/clients", response_model=list[ClientWalletSummary])
def platform_clients(user: CurrentUser, session: SessionDep):
    return wallet_svc.all_client_wallets(session, user.id)


@router.get("/platform/clients/{user_id}", response_model=ClientWalletSummary)
def platform_client_detail(user_id: UUID, user: CurrentUser, session: SessionDep):
    if user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own wallets")
    result = wallet_svc.client_wallets_for_user(session, user_id)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return result


@router.post("/platform/freeze/{wallet_id}", response_model=MessageResponse)
def freeze_wallet(wallet_id: UUID, user: CurrentUser, session: SessionDep):
    wallet_svc.assert_wallet_owner(session, wallet_id, user.id)
    wallet_svc.freeze_wallet(session, wallet_id, frozen=True)
    return MessageResponse(message="Wallet frozen successfully.")


@router.post("/platform/unfreeze/{wallet_id}", response_model=MessageResponse)
def unfreeze_wallet(wallet_id: UUID, user: CurrentUser, session: SessionDep):
    wallet_svc.assert_wallet_owner(session, wallet_id, user.id)
    wallet_svc.freeze_wallet(session, wallet_id, frozen=False)
    return MessageResponse(message="Wallet unfrozen successfully.")
