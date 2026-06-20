from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import col, select

from app.api.deps import CurrentUser
from app.core.config import settings
from app.db.session import SessionDep
from app.models.branch import Branch
from app.models.notification_preference import NotificationPreference
from app.models.router import Router
from app.models.staff import Staff
from app.schemas.monitoring import (
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    RouterMonitorItem,
    RouterMonitorSummary,
    SnmpEnableResponse,
)
from app.services.messaging import normalize_sms_phone
from app.services.snmp_monitor import get_or_create_preferences, poll_router
from app.services.routers.concentrator import ensure_snmp_forwarding
from app.services.routers.routeros import enable_snmp

router = APIRouter(tags=["Monitoring"])


def _accessible_router(session: SessionDep, router_id: UUID, user_id: UUID) -> Router:
    db_router = session.get(Router, router_id)
    branch = session.get(Branch, db_router.branch_id) if db_router else None
    if not db_router or not branch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Router not found or access denied")
    if branch.user_id != user_id:
        staff = session.exec(
            select(Staff)
            .where(Staff.branch_id == branch.id)
            .where(Staff.user_id == user_id)
            .where(Staff.is_active.is_(True))
        ).first()
        permissions = set((staff.permissions if staff else "").split(","))
        if not staff or "routers" not in permissions:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Router not found or access denied")
    return db_router


def _preference_response(preferences: NotificationPreference) -> NotificationPreferenceResponse:
    return NotificationPreferenceResponse(
        email_router_alerts=preferences.email_router_alerts,
        sms_router_alerts=preferences.sms_router_alerts,
        sms_phone_number=preferences.sms_phone_number,
        sms_cost_ugx=settings.sms_notification_cost,
    )


@router.get("/notification-preferences", response_model=NotificationPreferenceResponse)
def notification_preferences(
    user: CurrentUser,
    session: SessionDep,
) -> NotificationPreferenceResponse:
    preferences = get_or_create_preferences(session, user)
    session.commit()
    return _preference_response(preferences)


@router.put("/notification-preferences", response_model=NotificationPreferenceResponse)
def update_notification_preferences(
    payload: NotificationPreferenceUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> NotificationPreferenceResponse:
    phone = payload.sms_phone_number.strip() if payload.sms_phone_number else None
    if payload.sms_router_alerts:
        try:
            phone = normalize_sms_phone(phone or "")
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    preferences = get_or_create_preferences(session, user)
    preferences.email_router_alerts = payload.email_router_alerts
    preferences.sms_router_alerts = payload.sms_router_alerts
    preferences.sms_phone_number = phone
    preferences.updated_at = datetime.utcnow()
    session.add(preferences)
    session.commit()
    session.refresh(preferences)
    return _preference_response(preferences)


@router.get("/snmp/status-summary", response_model=RouterMonitorSummary)
def snmp_status_summary(
    user: CurrentUser,
    session: SessionDep,
    branch_id: UUID | None = Query(default=None),
) -> RouterMonitorSummary:
    statement = (
        select(Router)
        .join(Branch, Router.branch_id == Branch.id)
        .outerjoin(
            Staff,
            (Staff.branch_id == Branch.id)
            & (Staff.user_id == user.id)
            & (Staff.is_active.is_(True)),
        )
        .where(or_(Branch.user_id == user.id, Staff.user_id == user.id))
        .where(Router.is_active.is_(True))
        .order_by(col(Router.name))
    )
    if branch_id:
        statement = statement.where(Router.branch_id == branch_id)
    routers = session.exec(statement).all()
    configured = [item for item in routers if item.snmp_configured]
    online = sum(item.snmp_status == "online" for item in configured)
    offline = sum(item.snmp_status == "offline" for item in configured)
    unknown = len(configured) - online - offline
    checked_values = [item.snmp_checked_at for item in configured if item.snmp_checked_at]
    overall = "offline" if offline else "online" if online and not unknown else "unknown"
    return RouterMonitorSummary(
        status=overall,
        online=online,
        offline=offline,
        unknown=unknown,
        total=len(configured),
        last_checked_at=max(checked_values) if checked_values else None,
        routers=[
            RouterMonitorItem(
                router_id=item.id,
                router_name=item.name,
                status=item.snmp_status,
                configured=item.snmp_configured,
                checked_at=item.snmp_checked_at,
                uptime_seconds=item.snmp_uptime_seconds,
                error=item.snmp_error,
            )
            for item in routers
        ],
    )


@router.post("/routers/{router_id}/snmp/enable", response_model=SnmpEnableResponse)
def enable_router_snmp(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> SnmpEnableResponse:
    db_router = _accessible_router(session, router_id, user.id)
    try:
        enable_snmp(db_router)
    except Exception as exc:
        message = str(exc)
        if any(word in message.lower() for word in ("permission", "not enough", "cannot write")):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This router uses the legacy read-only billing account. Re-run its secure setup script once, then use Enable SNMP again.",
            ) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Could not enable SNMP on the physical MikroTik: {message}",
        ) from exc

    chr_forwarding_enabled = False
    chr_pending_provisioning = False
    try:
        ensure_snmp_forwarding(session, db_router)
        chr_forwarding_enabled = True
    except ValueError as exc:
        if "provisioning" in str(exc).lower():
            # Tunnel not yet provisioned physical SNMP is fine, CHR NAT will be
            # configured automatically once the tunnel comes up.
            chr_pending_provisioning = True
        else:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"SNMP was enabled on the physical router, but CHR forwarding failed: {exc}",
            ) from exc
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"SNMP was enabled on the physical router, but CHR forwarding failed: {exc}",
        ) from exc

    db_router.snmp_configured = True
    session.add(db_router)
    session.commit()

    if chr_pending_provisioning:
        return SnmpEnableResponse(
            success=False,
            router_id=db_router.id,
            router_name=db_router.name,
            physical_router_enabled=True,
            chr_forwarding_enabled=False,
            verified=False,
            uptime_seconds=None,
            message=(
                "SNMP was enabled on the physical MikroTik. "
                "CHR forwarding will be configured automatically once the tunnel is provisioned."
            ),
        )

    poll_router(session, db_router, notify_transitions=False)
    verified = db_router.snmp_status == "online"
    return SnmpEnableResponse(
        success=verified,
        router_id=db_router.id,
        router_name=db_router.name,
        physical_router_enabled=True,
        chr_forwarding_enabled=chr_forwarding_enabled,
        verified=verified,
        uptime_seconds=db_router.snmp_uptime_seconds,
        message=(
            "SNMP is enabled on the physical MikroTik and CHR, and monitoring is online."
            if verified
            else "SNMP and CHR forwarding were configured, but the verification poll did not receive a response yet."
        ),
    )
