from collections import Counter
from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, select

from app.api.deps import CurrentUser
from app.core.config import settings
from app.db.session import SessionDep
from app.models.branch import Branch
from app.models.branch_wallet import BranchWallet, SmsWalletTransaction
from app.models.message import MessageDraft, MessageLog
from app.services.snmp_monitor import get_or_create_preferences
from app.models.router import Router
from app.models.user import User
from app.models.voucher_purchase import VoucherPurchase
from app.schemas.messaging import (
    BulkMessageRequest,
    BulkMessageResponse,
    MessageActivityListResponse,
    MessageActivityResponse,
    MessageContactListResponse,
    MessageContactResponse,
    MessageSendResult,
    MessageDraftResponse,
    MessageDraftUpdate,
    BulkSmsSettingsResponse,
    BulkSmsSettingsUpdate,
    SmsWalletMobileMoneyTopupRequest,
    SmsWalletMutationResponse,
    SmsWalletResponse,
    SmsWalletTransactionResponse,
    SmsWalletTransferRequest,
)
from app.services.access import require_branch_access
from app.services.messaging import (
    normalize_sms_phone,
    render_voucher_message,
    send_sms,
    sms_failure_reason,
    sms_was_accepted,
)
from app.services import sms_wallet as sms_wallet_svc

router = APIRouter(tags=["Messaging"])


def _activity_response(row: MessageLog) -> MessageActivityResponse:
    return MessageActivityResponse(
        id=str(row.id),
        branch_id=str(row.branch_id),
        user_id=str(row.user_id),
        message=row.message,
        recipients=list(row.recipients or []),
        message_type=row.message_type,
        status=row.status,
        sent=row.sent,
        failed=row.failed,
        results=[MessageSendResult(**result) for result in (row.results or [])],
        error=row.error,
        cost_per_sms=row.cost_per_sms,
        total_charged=row.total_charged,
        wallet_balance=row.wallet_balance,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _fail_log(session: SessionDep, row: MessageLog, error: str) -> None:
    row.status = "failed"
    row.failed = max(row.failed, len(row.recipients or []))
    row.error = error
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()


def _sms_wallet_response(wallet, branch_name: str) -> SmsWalletResponse:
    return SmsWalletResponse(
        id=str(wallet.id),
        branch_id=str(wallet.branch_id),
        branch_name=branch_name,
        balance=wallet.balance,
        total_deposited=wallet.total_deposited,
        total_spent=wallet.total_spent,
        is_frozen=wallet.is_frozen,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


def _sms_txn_response(txn: SmsWalletTransaction) -> SmsWalletTransactionResponse:
    return SmsWalletTransactionResponse(
        id=str(txn.id),
        sms_wallet_id=str(txn.sms_wallet_id),
        branch_id=str(txn.branch_id),
        amount=txn.amount,
        transaction_type=txn.transaction_type.lower(),
        reference=txn.reference,
        status=txn.status,
        source_wallet_transaction_id=str(txn.source_wallet_transaction_id) if txn.source_wallet_transaction_id else None,
        phone_number=txn.phone_number,
        gateway_reference=txn.gateway_reference,
        gateway_status=txn.gateway_status,
        failure_reason=txn.failure_reason,
        last_checked_at=txn.last_checked_at,
        created_at=txn.created_at,
    )


def branch_vouchers(session: SessionDep, branch_id: UUID) -> list[VoucherPurchase]:
    router_names = session.exec(
        select(Router.name).where(Router.branch_id == branch_id)
    ).all()
    normalized_names = [name.strip().upper() for name in router_names]
    if not normalized_names:
        return []
    return list(
        session.exec(
            select(VoucherPurchase)
            .where(col(VoucherPurchase.router_name).in_(normalized_names))
            .where(VoucherPurchase.phone_number != "BULK")
            .order_by(VoucherPurchase.created_at.desc())
        ).all()
    )


def contact_map(session: SessionDep, branch_id: UUID) -> dict[str, MessageContactResponse]:
    vouchers = branch_vouchers(session, branch_id)
    counts: Counter[str] = Counter()
    contacts: dict[str, MessageContactResponse] = {}

    for voucher in vouchers:
        try:
            phone_number = normalize_sms_phone(voucher.phone_number)
        except ValueError:
            continue
        counts[phone_number] += 1
        if phone_number not in contacts:
            contacts[phone_number] = MessageContactResponse(
                phone_number=phone_number,
                wifi_name=voucher.router_name,
                voucher_code=voucher.voucher_code,
                purchase_count=0,
                last_purchase_at=voucher.created_at,
            )

    for phone_number, contact in contacts.items():
        contact.purchase_count = counts[phone_number]
    return contacts


@router.get(
    "/branches/{branch_id}/message-contacts",
    response_model=MessageContactListResponse,
)
def list_message_contacts(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=200, ge=1, le=500),
) -> MessageContactListResponse:
    require_branch_access(session, branch_id, user, "support")
    contacts = list(contact_map(session, branch_id).values())
    query = (search or "").strip().lower()
    if query:
        contacts = [
            contact
            for contact in contacts
            if query in contact.phone_number.lower()
            or query in contact.wifi_name.lower()
            or query in contact.voucher_code.lower()
        ]
    return MessageContactListResponse(contacts=contacts[:limit], total=len(contacts))


@router.get(
    "/branches/{branch_id}/messages",
    response_model=MessageActivityListResponse,
)
def list_message_activity(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=50, ge=1, le=200),
) -> MessageActivityListResponse:
    require_branch_access(session, branch_id, user, "support")
    rows = session.exec(
        select(MessageLog)
        .where(MessageLog.branch_id == branch_id)
        .order_by(MessageLog.created_at.desc())
        .limit(limit)
    ).all()
    return MessageActivityListResponse(
        activities=[_activity_response(row) for row in rows],
        total=len(rows),
    )


@router.get(
    "/branches/{branch_id}/messages/draft",
    response_model=MessageDraftResponse,
)
def get_message_draft(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MessageDraftResponse:
    require_branch_access(session, branch_id, user, "support")
    draft = session.exec(
        select(MessageDraft)
        .where(MessageDraft.branch_id == branch_id)
        .where(MessageDraft.user_id == user.id)
    ).first()
    if not draft:
        return MessageDraftResponse(message="", message_type="voucher", recipients=[])
    return MessageDraftResponse(
        id=str(draft.id),
        message=draft.message,
        message_type=draft.message_type,
        recipients=list(draft.recipients or []),
        updated_at=draft.updated_at,
    )


@router.put(
    "/branches/{branch_id}/messages/draft",
    response_model=MessageDraftResponse,
)
def save_message_draft(
    branch_id: UUID,
    payload: MessageDraftUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> MessageDraftResponse:
    require_branch_access(session, branch_id, user, "support")
    recipients: list[str] = []
    for value in payload.recipients:
        normalized = normalize_sms_phone(value)
        if normalized not in recipients:
            recipients.append(normalized)
    draft = session.exec(
        select(MessageDraft)
        .where(MessageDraft.branch_id == branch_id)
        .where(MessageDraft.user_id == user.id)
    ).first() or MessageDraft(branch_id=branch_id, user_id=user.id)
    draft.message = payload.message
    draft.message_type = payload.message_type
    draft.recipients = recipients
    draft.updated_at = datetime.utcnow()
    session.add(draft)
    session.commit()
    session.refresh(draft)
    return MessageDraftResponse(
        id=str(draft.id),
        message=draft.message,
        message_type=draft.message_type,
        recipients=list(draft.recipients or []),
        updated_at=draft.updated_at,
    )


def _bulk_sms_settings_response(preferences) -> BulkSmsSettingsResponse:
    return BulkSmsSettingsResponse(
        voucher_sms_enabled=preferences.bulk_sms_voucher_enabled,
        low_balance_sms_enabled=preferences.bulk_sms_low_balance_enabled,
        low_balance_threshold=preferences.bulk_sms_low_balance_threshold,
        admin_buy_for_sms_enabled=preferences.bulk_sms_admin_buy_for_enabled,
        sms_cost_ugx=settings.sms_notification_cost,
    )


@router.get(
    "/branches/{branch_id}/messages/settings",
    response_model=BulkSmsSettingsResponse,
)
def get_bulk_sms_settings(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> BulkSmsSettingsResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    owner = session.get(User, branch.user_id) or user
    preferences = get_or_create_preferences(session, owner)
    return _bulk_sms_settings_response(preferences)


@router.put(
    "/branches/{branch_id}/messages/settings",
    response_model=BulkSmsSettingsResponse,
)
def update_bulk_sms_settings(
    branch_id: UUID,
    payload: BulkSmsSettingsUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> BulkSmsSettingsResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    owner = session.get(User, branch.user_id) or user
    preferences = get_or_create_preferences(session, owner)
    preferences.bulk_sms_voucher_enabled = payload.voucher_sms_enabled
    preferences.bulk_sms_low_balance_enabled = payload.low_balance_sms_enabled
    preferences.bulk_sms_low_balance_threshold = payload.low_balance_threshold
    preferences.bulk_sms_admin_buy_for_enabled = payload.admin_buy_for_sms_enabled
    preferences.updated_at = datetime.utcnow()
    session.add(preferences)
    session.commit()
    session.refresh(preferences)
    return _bulk_sms_settings_response(preferences)


@router.get(
    "/branches/{branch_id}/messages/wallet",
    response_model=SmsWalletResponse,
)
def get_sms_wallet(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> SmsWalletResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    wallet = sms_wallet_svc.get_sms_wallet_for_branch(session, branch_id)
    return _sms_wallet_response(wallet, branch.name)


@router.get(
    "/branches/{branch_id}/messages/wallet/transactions",
    response_model=list[SmsWalletTransactionResponse],
)
def list_sms_wallet_transactions(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SmsWalletTransactionResponse]:
    require_branch_access(session, branch_id, user, "support")
    wallet = sms_wallet_svc.get_sms_wallet_for_branch(session, branch_id)
    txns = sms_wallet_svc.list_sms_transactions(session, wallet.id, limit, offset)
    return [_sms_txn_response(txn) for txn in txns]


@router.post(
    "/branches/{branch_id}/messages/wallet/transfer",
    response_model=SmsWalletMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def transfer_to_sms_wallet(
    branch_id: UUID,
    payload: SmsWalletTransferRequest,
    user: CurrentUser,
    session: SessionDep,
) -> SmsWalletMutationResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    branch_wallet = session.exec(select(BranchWallet).where(BranchWallet.branch_id == branch.id)).first()
    if not branch_wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Main wallet not found")
    sms_wallet = sms_wallet_svc.get_sms_wallet_for_branch(session, branch_id)
    txn, updated_wallet = sms_wallet_svc.transfer_from_branch_wallet(
        session,
        branch_wallet.id,
        sms_wallet.id,
        payload.amount,
        user.id,
    )
    return SmsWalletMutationResponse(
        transaction=_sms_txn_response(txn),
        wallet=_sms_wallet_response(updated_wallet, branch.name),
    )


@router.post(
    "/branches/{branch_id}/messages/wallet/mobile-money-topups",
    response_model=SmsWalletMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def initiate_sms_wallet_mobile_money_topup(
    branch_id: UUID,
    payload: SmsWalletMobileMoneyTopupRequest,
    user: CurrentUser,
    session: SessionDep,
) -> SmsWalletMutationResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    sms_wallet = sms_wallet_svc.get_sms_wallet_for_branch(session, branch_id)
    phone = normalize_sms_phone(payload.phone_number)
    txn, updated_wallet = sms_wallet_svc.initiate_mobile_money_topup(
        session,
        sms_wallet.id,
        payload.amount,
        phone,
    )
    return SmsWalletMutationResponse(
        transaction=_sms_txn_response(txn),
        wallet=_sms_wallet_response(updated_wallet, branch.name),
    )


@router.get(
    "/branches/{branch_id}/messages/wallet/mobile-money-topups/{transaction_id}/status",
    response_model=SmsWalletMutationResponse,
)
def verify_sms_wallet_mobile_money_topup(
    branch_id: UUID,
    transaction_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> SmsWalletMutationResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    txn, updated_wallet = sms_wallet_svc.verify_mobile_money_topup(session, transaction_id)
    if updated_wallet.branch_id != branch_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SMS wallet transaction not found")
    return SmsWalletMutationResponse(
        transaction=_sms_txn_response(txn),
        wallet=_sms_wallet_response(updated_wallet, branch.name),
    )


@router.post(
    "/branches/{branch_id}/messages/send",
    response_model=BulkMessageResponse,
)
def send_bulk_message(
    branch_id: UUID,
    payload: BulkMessageRequest,
    user: CurrentUser,
    session: SessionDep,
) -> BulkMessageResponse:
    branch, _staff = require_branch_access(session, branch_id, user, "support")
    contacts = contact_map(session, branch_id)
    activity = MessageLog(
        branch_id=branch_id,
        user_id=user.id,
        message=payload.message.strip(),
        message_type="voucher" if payload.use_voucher_template else "custom",
        recipients=list(payload.phone_numbers),
        cost_per_sms=settings.sms_notification_cost,
    )
    session.add(activity)
    session.commit()
    session.refresh(activity)

    requested_numbers: list[str] = []
    for value in payload.phone_numbers:
        try:
            phone_number = normalize_sms_phone(value)
        except ValueError as exc:
            _fail_log(session, activity, str(exc))
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        if payload.use_voucher_template and phone_number not in contacts:
            error = f"{phone_number} has no voucher token for this branch"
            _fail_log(session, activity, error)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
        if phone_number not in requested_numbers:
            requested_numbers.append(phone_number)

    message = payload.message.strip()
    if payload.use_voucher_template and "{code}" not in message and "{}" not in message:
        error = "Voucher messages must include {code} or {}"
        _fail_log(session, activity, error)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error,
        )

    cost_per_sms = settings.sms_notification_cost
    estimated_cost = cost_per_sms * len(requested_numbers)
    sms_wallet = sms_wallet_svc.get_sms_wallet_for_branch(session, branch.id)
    if sms_wallet.is_frozen or sms_wallet.balance < max(cost_per_sms, estimated_cost):
        error = (
            f"Insufficient SMS wallet balance. This send needs {estimated_cost} UGX "
            f"at {cost_per_sms} UGX per SMS."
        )
        _fail_log(session, activity, error)
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=error,
        )

    results: list[MessageSendResult] = []
    try:
        if payload.use_voucher_template:
            for phone_number in requested_numbers:
                contact = contacts[phone_number]
                rendered = render_voucher_message(message, contact.wifi_name, contact.voucher_code)
                try:
                    response = send_sms(rendered, [phone_number])
                    accepted = sms_was_accepted(response, phone_number)
                    results.append(
                        MessageSendResult(
                            phone_number=phone_number,
                            success=accepted,
                            message=rendered if accepted else sms_failure_reason(response, phone_number),
                            provider_response=response,
                        )
                    )
                except RuntimeError:
                    raise
                except Exception as exc:
                    results.append(
                        MessageSendResult(
                            phone_number=phone_number,
                            success=False,
                            message=str(exc),
                        )
                    )
        else:
            response = send_sms(message, requested_numbers)
            results = [
                MessageSendResult(
                    phone_number=phone_number,
                    success=sms_was_accepted(response, phone_number),
                    message=message if sms_was_accepted(response, phone_number) else sms_failure_reason(response, phone_number),
                    provider_response=response,
                )
                for phone_number in requested_numbers
            ]
    except RuntimeError as exc:
        _fail_log(session, activity, str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        _fail_log(session, activity, f"Africa's Talking SMS request failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Africa's Talking SMS request failed: {exc}",
        ) from exc

    sent = sum(result.success for result in results)
    failed = len(results) - sent
    total_charged = 0
    wallet_balance = sms_wallet.balance
    if sent:
        total_charged = cost_per_sms * sent
        charged, wallet_balance = sms_wallet_svc.charge_sms(
            session,
            branch.id,
            user.id,
            total_charged,
            f"SMS-BULK-{activity.id}",
        )
        if not charged:
            total_charged = 0
    activity.recipients = requested_numbers
    activity.status = "completed" if failed == 0 else "partial" if sent else "failed"
    activity.sent = sent
    activity.failed = failed
    activity.results = [result.model_dump(mode="json") for result in results]
    activity.error = None if sent else next((result.message for result in results if not result.success), None)
    activity.total_charged = total_charged
    activity.wallet_balance = wallet_balance
    activity.updated_at = datetime.utcnow()
    session.add(activity)
    session.exec(
        sa.delete(MessageDraft)
        .where(MessageDraft.branch_id == branch_id)
        .where(MessageDraft.user_id == user.id)
    )
    session.commit()
    return BulkMessageResponse(
        id=str(activity.id),
        success=failed == 0,
        sent=sent,
        failed=failed,
        results=results,
        cost_per_sms=cost_per_sms,
        total_charged=total_charged,
        wallet_balance=wallet_balance,
        created_at=activity.created_at,
    )
