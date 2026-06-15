from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import requests
from sqlmodel import Session, select

from app.models.branch import Branch
from app.models.staff import Staff
from app.models.telegram_connection import TelegramConnection
from app.core.config import settings
from app.services.routers.credentials import decrypt_secret, encrypt_secret

TELEGRAM_API = "https://api.telegram.org"
EVENT_FIELDS = {
    "voucher_purchase": "voucher_purchases",
    "voucher_batch": "voucher_batches",
    "withdrawal": "withdrawal_receipts",
    "router": "router_alerts",
    "router_hourly": "hourly_router_ping",
    "ads_publish": "router_alerts",
}
EVENT_TEMPLATES = {
    "voucher_purchase": {"emoji": "🎟️", "path": "/vouchers", "button": "View vouchers"},
    "voucher_batch": {"emoji": "🧾", "path": "/vouchers", "button": "View voucher batch"},
    "withdrawal": {"emoji": "💸", "path": "/withdrawals", "button": "View withdrawals"},
    "router": {"emoji": "📡", "path": "/router", "button": "View routers"},
    "router_hourly": {"emoji": "🟢", "path": "/router", "button": "View router status"},
    "ads_publish": {"emoji": "📣", "path": "/settings/adsmob", "button": "Open AdsMob"},
    "platform_admin": {"emoji": "🛡️", "path": "/platform-admin", "button": "Open platform admin"},
    "connection": {"emoji": "✅", "path": "/settings/telegram", "button": "Open Telegram settings"},
    "test": {"emoji": "🔔", "path": "/settings/telegram", "button": "Open Renult"},
}


class TelegramError(RuntimeError):
    pass


def _request(token: str, method: str, payload: dict[str, Any] | None = None) -> Any:
    try:
        response = requests.post(
            f"{TELEGRAM_API}/bot{token}/{method}",
            json=payload or {},
            timeout=12,
        )
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise TelegramError("Could not reach the Telegram Bot API") from exc
    if not response.ok or not data.get("ok"):
        description = str(data.get("description") or "Telegram rejected the request")
        raise TelegramError(description)
    return data.get("result")


def discover_bot_chat(bot_token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    bot = _request(bot_token, "getMe")
    updates = _request(bot_token, "getUpdates", {"limit": 100, "timeout": 0})
    for update in reversed(updates or []):
        message = (
            update.get("message")
            or update.get("channel_post")
            or update.get("edited_message")
        )
        chat = message.get("chat") if message else None
        if chat and chat.get("id") is not None:
            return bot, chat
    raise TelegramError(
        "No Telegram chat was found. Open the bot in Telegram, send /start, then connect again."
    )


def upsert_connection(
    session: Session,
    user_id: UUID,
    bot_token: str,
    bot: dict[str, Any],
    chat: dict[str, Any],
) -> TelegramConnection:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user_id)
    ).first()
    if not connection:
        connection = TelegramConnection(
            user_id=user_id,
            bot_token_encrypted=encrypt_secret(bot_token),
            bot_username=str(bot.get("username") or ""),
            chat_id=str(chat["id"]),
        )
    connection.bot_token_encrypted = encrypt_secret(bot_token)
    connection.bot_username = str(bot.get("username") or "")
    connection.chat_id = str(chat["id"])
    connection.chat_title = (
        chat.get("title")
        or " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")]))
        or chat.get("username")
        or "Telegram chat"
    )
    connection.updated_at = datetime.utcnow()
    session.add(connection)
    session.commit()
    session.refresh(connection)
    return connection


def _event_message(event: str, text: str) -> tuple[str, dict[str, Any]]:
    template = EVENT_TEMPLATES.get(
        event,
        {"emoji": "🔔", "path": "/", "button": "Open Renult Billing System"},
    )
    lines = text.strip().splitlines()
    if lines:
        lines[0] = f"{template['emoji']} {lines[0]}"
    body = "\n".join(lines)
    branded = (
        f"{body}\n\n"
        "<blockquote><b>Renult Billing System</b>\n"
        "Hotspot operations, billing, campaigns and network monitoring.</blockquote>\n"
        f"<i>Sent {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</i>"
    )
    button_url = f"{settings.renult_app_url}{template['path']}"
    reply_markup = {
        "inline_keyboard": [[{
            "text": f"↗️ {template['button']}",
            "url": button_url,
        }]]
    }
    return branded, reply_markup


def send_connection_message(
    connection: TelegramConnection,
    text: str,
    reply_markup: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "chat_id": connection.chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    _request(
        decrypt_secret(connection.bot_token_encrypted),
        "sendMessage",
        payload,
    )


def send_connection_event(
    connection: TelegramConnection,
    event: str,
    text: str,
) -> None:
    message, reply_markup = _event_message(event, text)
    send_connection_message(connection, message, reply_markup)


def send_user_event(
    session: Session,
    user_id: UUID,
    event: str,
    text: str,
) -> bool:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user_id)
    ).first()
    preference = EVENT_FIELDS.get(event)
    if not connection or (preference and not getattr(connection, preference)):
        return False
    try:
        send_connection_event(connection, event, text)
        return True
    except TelegramError:
        return False


def send_branch_event(
    session: Session,
    branch_id: UUID,
    event: str,
    text: str,
) -> int:
    branch = session.get(Branch, branch_id)
    if not branch:
        return 0
    user_ids = {branch.user_id}
    user_ids.update(
        staff.user_id
        for staff in session.exec(
            select(Staff).where(
                Staff.branch_id == branch_id,
                Staff.is_active.is_(True),
                Staff.user_id.is_not(None),
            )
        ).all()
        if staff.user_id
    )
    return sum(send_user_event(session, user_id, event, text) for user_id in user_ids)


def branch_has_event_connection(session: Session, branch_id: UUID, event: str) -> bool:
    branch = session.get(Branch, branch_id)
    if not branch:
        return False
    user_ids = {branch.user_id}
    user_ids.update(
        staff.user_id
        for staff in session.exec(
            select(Staff).where(
                Staff.branch_id == branch_id,
                Staff.is_active.is_(True),
                Staff.user_id.is_not(None),
            )
        ).all()
        if staff.user_id
    )
    connections = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id.in_(user_ids))
    ).all()
    preference = EVENT_FIELDS.get(event)
    return any(not preference or getattr(connection, preference) for connection in connections)


def user_has_event_connection(session: Session, user_id: UUID, event: str) -> bool:
    connection = session.exec(
        select(TelegramConnection).where(TelegramConnection.user_id == user_id)
    ).first()
    preference = EVENT_FIELDS.get(event)
    return bool(connection and (not preference or getattr(connection, preference)))


def verified_phone_name(phone_number: str) -> str | None:
    try:
        response = requests.post(
            "https://lucopay-backend.vercel.app/identity/msisdn",
            json={"msisdn": phone_number},
            headers={"Accept": "application/json"},
            timeout=5,
        )
        data = response.json()
        name = str(data.get("identityname") or "").strip()
        return name if response.ok and data.get("success") and name else None
    except (requests.RequestException, ValueError):
        return None
