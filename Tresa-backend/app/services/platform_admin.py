from datetime import datetime
from typing import Any

from sqlmodel import Session

from app.models.platform_admin import PlatformAuditLog, PlatformSetting
from app.models.user import User
from app.services.telegram import send_user_event


DEFAULT_SETTINGS: dict[str, Any] = {
    "voucher_fee_type": "percentage",
    "voucher_fee_value": 0,
    "deposit_fee_type": "percentage",
    "deposit_fee_percentage": 1,
    "deposit_fee_fixed_amount": 0,
    "withdrawal_fee_type": "percentage",
    "withdrawal_fee_percentage": 2,
    "withdrawal_fee_fixed_amount": 0,
    "withdrawal_min_amount": 500,
    "withdrawal_max_amount": 10_000_000,
    "voucher_prefix": "",
    "voucher_prefix_order": "prefix-first",
    "telegram_access_alerts": False,
}

ADMIN_PERMISSIONS = {
    "overview",
    "users",
    "permissions",
    "finance",
    "admin_shares",
    "broadcasts",
    "voucher_audit",
    "message_diagnostics",
    "tunnels",
    "storage",
    "dns",
    "subadmins",
    "system",
    "audit",
    "reports",
    "sessions",
    "notifications",
}

USER_SECTIONS = {
    "dashboard",
    "routers",
    "sales",
    "vouchers",
    "support",
    "network",
    "captive",
    "messages",
    "withdrawals",
    "branches",
    "settings",
}


def permissions_for(user: User) -> set[str]:
    if user.platform_role == "superadmin":
        return set(ADMIN_PERMISSIONS)
    return {
        item.strip()
        for item in (user.platform_permissions or "").split(",")
        if item.strip() in ADMIN_PERMISSIONS
    }


def get_setting(session: Session, key: str, default: Any = None) -> Any:
    setting = session.get(PlatformSetting, key)
    if setting is not None:
        return setting.value
    return DEFAULT_SETTINGS.get(key, default)


def settings_snapshot(session: Session) -> dict[str, Any]:
    return {key: get_setting(session, key, value) for key, value in DEFAULT_SETTINGS.items()}


def set_settings(session: Session, values: dict[str, Any], actor_id) -> dict[str, Any]:
    now = datetime.utcnow()
    for key, value in values.items():
        setting = session.get(PlatformSetting, key) or PlatformSetting(key=key)
        setting.value = value
        setting.updated_by = actor_id
        setting.updated_at = now
        session.add(setting)
    session.commit()
    return settings_snapshot(session)


def audit(
    session: Session,
    actor: User,
    action: str,
    target_type: str,
    target_id: str | None = None,
    details: Any = None,
) -> PlatformAuditLog:
    entry = PlatformAuditLog(
        actor_id=actor.id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    send_user_event(
        session,
        actor.id,
        "platform_admin",
        (
            "<b>Platform admin activity</b>\n"
            f"Action: {action}\n"
            f"Target: {target_type}{f' / {target_id}' if target_id else ''}"
        ),
    )
    return entry
