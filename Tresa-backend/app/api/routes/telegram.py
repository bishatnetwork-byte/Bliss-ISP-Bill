from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser
from app.db.session import SessionDep
from app.models.telegram_connection import TelegramConnection
from app.schemas.telegram import (
    TelegramActionResponse,
    TelegramConnectionResponse,
    TelegramConnectRequest,
    TelegramPreferenceUpdate,
)
from app.services.telegram import (
    TelegramError,
    discover_bot_chat,
    send_connection_event,
    upsert_connection,
)

router = APIRouter(prefix="/telegram", tags=["Telegram"])


def _response(connection: TelegramConnection | None) -> TelegramConnectionResponse:
    return TelegramConnectionResponse(
        connected=connection is not None,
        bot_username=connection.bot_username if connection else None,
        chat_id=connection.chat_id if connection else None,
        chat_title=connection.chat_title if connection else None,
        secondary_chat_id=connection.secondary_chat_id if connection else None,
        secondary_chat_title=connection.secondary_chat_title if connection else None,
        voucher_purchases=connection.voucher_purchases if connection else True,
        voucher_batches=connection.voucher_batches if connection else True,
        withdrawal_receipts=connection.withdrawal_receipts if connection else True,
        router_alerts=connection.router_alerts if connection else True,
        hourly_router_ping=connection.hourly_router_ping if connection else True,
    )


@router.get("/connection", response_model=TelegramConnectionResponse)
def telegram_connection(user: CurrentUser, session: SessionDep) -> TelegramConnectionResponse:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user.id)
    ).first()
    return _response(connection)


@router.post("/connection", response_model=TelegramConnectionResponse)
def connect_telegram(
    payload: TelegramConnectRequest,
    user: CurrentUser,
    session: SessionDep,
) -> TelegramConnectionResponse:
    token = payload.bot_token.strip()
    try:
        bot, chat = discover_bot_chat(token)
        connection = upsert_connection(session, user.id, token, bot, chat, payload.slot)
        send_connection_event(
            connection,
            "connection",
            f"<b>Renult connected</b>\nTelegram destination {payload.slot} is now active for this account.",
        )
    except TelegramError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return _response(connection)


@router.put("/preferences", response_model=TelegramConnectionResponse)
def update_telegram_preferences(
    payload: TelegramPreferenceUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> TelegramConnectionResponse:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user.id)
    ).first()
    if not connection:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connect a Telegram bot first")
    for field, value in payload.model_dump().items():
        setattr(connection, field, value)
    connection.updated_at = datetime.utcnow()
    session.add(connection)
    session.commit()
    session.refresh(connection)
    return _response(connection)


@router.post("/test", response_model=TelegramActionResponse)
def test_telegram(user: CurrentUser, session: SessionDep) -> TelegramActionResponse:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user.id)
    ).first()
    if not connection:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connect a Telegram bot first")
    try:
        send_connection_event(
            connection,
            "test",
            "<b>Renult test notification</b>\nYour Telegram connection is working.",
        )
    except TelegramError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return TelegramActionResponse(success=True, message="Test notification sent")


@router.delete("/connection", response_model=TelegramActionResponse)
def disconnect_telegram(user: CurrentUser, session: SessionDep, slot: int = 1) -> TelegramActionResponse:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user.id)
    ).first()
    if connection and slot == 2:
        connection.secondary_chat_id = None
        connection.secondary_chat_title = None
        connection.updated_at = datetime.utcnow()
        session.add(connection)
        session.commit()
        return TelegramActionResponse(success=True, message="Secondary Telegram chat disconnected")
    if connection:
        session.delete(connection)
        session.commit()
    return TelegramActionResponse(success=True, message="Telegram disconnected")
