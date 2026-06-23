from datetime import date, datetime
from html import escape
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.api.deps import CurrentUser
from app.db.session import SessionDep
from app.models.subscription import UserSubscription
from app.schemas.auth import MessageResponse
from app.schemas.subscription import SubscriptionCreate, SubscriptionResponse, SubscriptionUpdate
from app.services.email import send_email
from app.services.messaging import normalize_sms_phone, send_sms
from app.services.notification import notify

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


def _days_until(due_date: date) -> int:
    return (due_date - date.today()).days


def _response(row: UserSubscription) -> SubscriptionResponse:
    days_until_due = _days_until(row.due_date)
    return SubscriptionResponse(
        id=row.id,
        user_id=row.user_id,
        name=row.name,
        provider=row.provider,
        category=row.category,
        amount=row.amount,
        currency=row.currency,
        due_date=row.due_date,
        alert_days_before=row.alert_days_before,
        notify_in_app=row.notify_in_app,
        notify_email=row.notify_email,
        notify_sms=row.notify_sms,
        sms_phone=row.sms_phone,
        notes=row.notes,
        is_active=row.is_active,
        days_until_due=days_until_due,
        reminder_due=row.is_active and days_until_due <= row.alert_days_before,
        last_notified_on=row.last_notified_on,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _reminder_text(row: UserSubscription) -> tuple[str, str]:
    days = _days_until(row.due_date)
    if days < 0:
        timing = f"{abs(days)} day(s) overdue"
    elif days == 0:
        timing = "due today"
    else:
        timing = f"due in {days} day(s)"
    amount = f"{row.currency} {row.amount:,.0f}" if row.amount else row.currency
    title = f"{row.name} is {timing}"
    body = f"{row.name} ({row.provider or row.category}) is {timing}. Amount: {amount}. Due date: {row.due_date.isoformat()}."
    return title, body


def _send_subscription_reminder(
    row: UserSubscription,
    user: CurrentUser,
    session: SessionDep,
    force: bool = False,
) -> bool:
    today = date.today()
    if not row.is_active:
        return False
    if not force and _days_until(row.due_date) > row.alert_days_before:
        return False
    if not force and row.last_notified_on == today:
        return False

    title, body = _reminder_text(row)
    if row.notify_in_app:
        notify(session, user.id, "subscription", title, body)

    if row.notify_email:
        html = (
            f"<h2>{escape(title)}</h2>"
            f"<p>{escape(body)}</p>"
            "<p>Open Renult Settings to update this subscription reminder.</p>"
        )
        try:
            send_email(user.email, f"Renult reminder: {row.name}", html)
        except Exception:
            pass

    if row.notify_sms:
        phone = row.sms_phone or user.phone_number
        if phone:
            try:
                send_sms(body, [normalize_sms_phone(phone)])
            except Exception:
                pass

    row.last_notified_on = today
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return True


def _send_due_reminders(user: CurrentUser, session: SessionDep) -> None:
    rows = session.exec(
        select(UserSubscription)
        .where(UserSubscription.user_id == user.id)
        .where(UserSubscription.is_active == True)  # noqa: E712
    ).all()
    for row in rows:
        _send_subscription_reminder(row, user, session)


@router.get("", response_model=list[SubscriptionResponse])
def list_subscriptions(
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=100, ge=1, le=200),
    active_only: bool = False,
    send_due_alerts: bool = True,
) -> list[SubscriptionResponse]:
    if send_due_alerts:
        _send_due_reminders(user, session)

    query = select(UserSubscription).where(UserSubscription.user_id == user.id)
    if active_only:
        query = query.where(UserSubscription.is_active == True)  # noqa: E712
    rows = session.exec(query.order_by(UserSubscription.due_date.asc()).limit(limit)).all()
    return [_response(row) for row in rows]


@router.post("", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
def create_subscription(payload: SubscriptionCreate, user: CurrentUser, session: SessionDep) -> SubscriptionResponse:
    row = UserSubscription(user_id=user.id, **payload.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    _send_subscription_reminder(row, user, session)
    session.refresh(row)
    return _response(row)


@router.put("/{subscription_id}", response_model=SubscriptionResponse)
def update_subscription(
    subscription_id: UUID,
    payload: SubscriptionUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> SubscriptionResponse:
    row = session.exec(
        select(UserSubscription)
        .where(UserSubscription.id == subscription_id)
        .where(UserSubscription.user_id == user.id)
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    if "due_date" in changes:
        row.last_notified_on = None
    session.add(row)
    session.commit()
    session.refresh(row)
    return _response(row)


@router.post("/{subscription_id}/notify", response_model=MessageResponse)
def notify_subscription(subscription_id: UUID, user: CurrentUser, session: SessionDep) -> MessageResponse:
    row = session.exec(
        select(UserSubscription)
        .where(UserSubscription.id == subscription_id)
        .where(UserSubscription.user_id == user.id)
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    sent = _send_subscription_reminder(row, user, session, force=True)
    return MessageResponse(message="Reminder sent." if sent else "Reminder was not sent.")


@router.delete("/{subscription_id}", response_model=MessageResponse)
def delete_subscription(subscription_id: UUID, user: CurrentUser, session: SessionDep) -> MessageResponse:
    row = session.exec(
        select(UserSubscription)
        .where(UserSubscription.id == subscription_id)
        .where(UserSubscription.user_id == user.id)
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    session.delete(row)
    session.commit()
    return MessageResponse(message="Subscription deleted.")
