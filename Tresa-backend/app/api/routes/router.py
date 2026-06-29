from datetime import datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlmodel import Session, col, select

from app.api.deps import CurrentUser
from app.core.config import settings
from app.db.session import SessionDep
from app.db.session import engine
from app.models.branch import Branch
from app.models.captive_portal import CaptivePortal
from app.models.router import Router
from app.models.router_package import RouterPackage
from app.models.staff import Staff
from app.models.user import User
from app.models.voucher_purchase import VoucherPurchase
from app.models.platform_admin import VoucherActivationAudit
from app.schemas.auth import MessageResponse
from app.schemas.hotspot_provision import (
    HotspotProvisionConfig,
    HotspotProvisionResponse,
    RouterHardwareResponse,
)
from app.schemas.router import (
    RouterActiveUsersResponse,
    RouterCreate,
    RouterDeployHeartbeatRequest,
    RouterDeployHeartbeatResponse,
    RouterFeaturesResponse,
    RouterIpBindingPayload,
    RouterIpBindingResponse,
    RouterIpBindingsResponse,
    RouterPingRequest,
    RouterPingResponse,
    RouterPublishScriptRequest,
    RouterPublishScriptResponse,
    RouterRebootResponse,
    RouterRemoteAccessResponse,
    RouterSecureSetupResponse,
    RouterCommandRequest,
    RouterCommandResponse,
    RouterConfirmRequest,
    RouterHeartbeatRequest,
    RouterHeartbeatResponse,
    RouterCredentialsRequest,
    RouterProvisionRequest,
    RouterProvisionResponse,
    RouterRegisterRequest,
    RouterRegisterResponse,
    RouterResourceResponse,
    RouterLogsResponse,
    RouterResponse,
    RouterStatusResponse,
    RouterTestConnectionRequest,
    RouterTestConnectionResponse,
    RouterTrialResponse,
    RouterTrialUpdate,
    RouterUpdate,
    RouterVouchersResponse,
)
from app.services.routers.active_users.active_users import get_remote_winbox_access
from app.services.portal import normalize_router_name, push_captive_files_to_mikrotik
from app.services.routers.hotspot_config import (
    apply_trial_settings,
    detect_router_hardware,
    provision_hotspot,
)
from app.services.routers.routeros import (
    get_active_hotspot_users,
    get_hotspot_vouchers,
    get_hotspot_ip_bindings,
    get_router_logs,
    get_router_features,
    get_router_status,
    kick_active_hotspot_user,
    create_hotspot_ip_binding,
    delete_hotspot_ip_binding,
    ping_tcp,
    ping_from_router,
    reboot_router,
    router_defaults,
    test_connection,
    update_hotspot_ip_binding,
)
from app.models.notification import Notification
from app.services.notification import notify
from app.services.routers.security import (
    CHR_TUNNEL_ADDRESS,
    build_secure_setup_script,
    deploy_heartbeat_monitor,
    generate_api_password,
    generate_api_port,
    generate_api_username,
    validate_api_port,
)
from app.services.storage import STORAGE_ERRORS, object_url, upload_bytes
from app.services.voucher_lifecycle import router_uptime_duration, update_voucher_lifecycle
from app.services.routers.concentrator import (
    confirm_router,
    delete_router_from_chr,
    ensure_winbox_forwarding,
    log_error,
    provision_router,
    register_router,
    registration_token,
    router_resource,
    run_safe_command,
    save_router_credentials,
    verify_registration_token,
    verify_heartbeat_token,
)
from app.services.routers.credentials import decrypt_secret, encrypt_secret
from app.services.routers.events import router_event_hub
from app.services.security import decode_access_token
from app.services.router_heartbeat import record_heartbeat
from app.services.telegram import send_branch_event

router = APIRouter(tags=["Routers"])


def check_branch_ownership(session: SessionDep, branch_id: UUID, user_id: UUID) -> Branch:
    branch = session.get(Branch, branch_id)
    if branch and branch.user_id != user_id:
        staff = session.exec(
            select(Staff)
            .where(Staff.user_id == user_id)
            .where(Staff.branch_id == branch_id)
            .where(Staff.is_active.is_(True))
        ).first()
        permissions = set((staff.permissions if staff else "").split(","))
        if not staff or "routers" not in permissions:
            branch = None
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found or access denied",
        )
    return branch


def get_router_with_ownership(session: SessionDep, router_id: UUID, user_id: UUID) -> Router:
    db_router = session.get(Router, router_id)
    if not db_router:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")
    check_branch_ownership(session, db_router.branch_id, user_id)
    return db_router


def serialize_router(db_router: Router) -> RouterResponse:
    return RouterResponse(
        id=db_router.id,
        branch_id=db_router.branch_id,
        name=db_router.name,
        host=db_router.host,
        port=db_router.port,
        username=db_router.username,
        plaintext_login=db_router.plaintext_login,
        location=db_router.location,
        description=db_router.description,
        is_active=db_router.is_active,
        ppp_username=db_router.ppp_username,
        tunnel_ip=db_router.tunnel_ip,
        nat_port=db_router.nat_port,
        trial_enabled=db_router.trial_enabled,
        trial_minutes=db_router.trial_minutes,
        status=db_router.status,
        hotspot_provisioned=db_router.hotspot_provisioned,
        last_seen=db_router.last_seen,
        created_at=db_router.created_at,
        updated_at=db_router.updated_at,
    )


def notify_router_event(
    session: SessionDep,
    user_id: UUID,
    router_name: str,
    title: str,
    body: str,
    *,
    dedupe_minutes: int = 0,
) -> None:
    if dedupe_minutes:
        existing = session.exec(
            select(Notification)
            .where(Notification.user_id == user_id)
            .where(Notification.title == title)
            .where(Notification.created_at >= datetime.utcnow() - timedelta(minutes=dedupe_minutes))
        ).first()
        if existing:
            return
    notify(session, user_id, "router", title, body)


@router.get("/branches/{branch_id}/routers", response_model=list[RouterResponse])
def list_branch_routers(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=100, ge=1),
    offset: int = Query(default=0, ge=0),
) -> list[RouterResponse]:
    check_branch_ownership(session, branch_id, user.id)
    routers = session.exec(
        select(Router)
        .where(Router.branch_id == branch_id)
        .offset(offset)
        .limit(limit)
    ).all()
    return [serialize_router(db_router) for db_router in routers]


@router.post("/branches/{branch_id}/routers", response_model=RouterResponse, status_code=status.HTTP_201_CREATED)
def add_branch_router(
    branch_id: UUID,
    payload: RouterCreate,
    user: CurrentUser,
    session: SessionDep,
) -> RouterResponse:
    check_branch_ownership(session, branch_id, user.id)

    name = payload.name.strip()
    existing = session.exec(
        select(Router)
        .where(Router.branch_id == branch_id)
        .where(Router.name == name)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Router with this name already exists in this branch",
        )

    defaults = router_defaults()
    router_id = uuid4()
    try:
        api_port = payload.port if payload.port is not None else generate_api_port(session)
        validate_api_port(api_port)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if session.exec(select(Router).where(Router.port == api_port)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Router API port {api_port} is already assigned",
        )

    db_router = Router(
        id=router_id,
        branch_id=branch_id,
        name=name,
        host=(payload.host or defaults["host"]).strip(),
        port=api_port,
        username=(payload.username or generate_api_username(str(router_id))).strip(),
        password=encrypt_secret(payload.password or generate_api_password()),
        plaintext_login=payload.plaintext_login,
        location=payload.location.strip() if payload.location else None,
        description=payload.description.strip() if payload.description else None,
        is_active=payload.is_active,
        nat_port=api_port,
    )
    session.add(db_router)
    session.commit()
    session.refresh(db_router)

    # Check connectivity after saving
    ping_result = ping_tcp(db_router.host, db_router.port)
    resp = serialize_router(db_router)
    resp.reachable = ping_result["reachable"]
    resp.latency_ms = ping_result["latency_ms"]
    resp.connectivity_error = ping_result["error"]
    return resp


@router.get("/routers/{router_id}", response_model=RouterResponse)
def get_router(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterResponse:
    return serialize_router(get_router_with_ownership(session, router_id, user.id))


@router.put("/routers/{router_id}", response_model=RouterResponse)
def update_router(
    router_id: UUID,
    payload: RouterUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> RouterResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    original_name = db_router.name

    if payload.name is not None:
        new_name = payload.name.strip()
        if new_name != db_router.name:
            existing = session.exec(
                select(Router)
                .where(Router.branch_id == db_router.branch_id)
                .where(Router.name == new_name)
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Router with this name already exists in this branch",
                )
            db_router.name = new_name
    if payload.host is not None:
        db_router.host = payload.host.strip()
    if payload.port is not None:
        try:
            validate_api_port(payload.port)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        port_owner = session.exec(
            select(Router)
            .where(Router.port == payload.port)
            .where(Router.id != db_router.id)
        ).first()
        if port_owner:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Router API port {payload.port} is already assigned",
            )
        db_router.port = payload.port
    if payload.username is not None:
        db_router.username = payload.username.strip()
    if payload.password is not None:
        db_router.password = encrypt_secret(payload.password)
    if payload.plaintext_login is not None:
        db_router.plaintext_login = payload.plaintext_login
    if payload.location is not None:
        db_router.location = payload.location.strip() if payload.location else None
    if payload.description is not None:
        db_router.description = payload.description.strip() if payload.description else None
    if payload.is_active is not None:
        db_router.is_active = payload.is_active

    db_router.updated_at = datetime.utcnow()
    session.add(db_router)
    session.commit()
    session.refresh(db_router)

    if payload.name is not None and db_router.name != original_name:
        captive = session.exec(select(CaptivePortal).where(CaptivePortal.router_id == db_router.id)).first()
        if captive:
            captive.router_name = normalize_router_name(db_router.name)
            captive.updated_at = datetime.utcnow()
            session.add(captive)
            session.commit()
        push_captive_files_to_mikrotik(
            db_router,
            captive.portal_template if captive else "renault",
            session=session,
        )

    return serialize_router(db_router)


@router.put("/routers/{router_id}/trial", response_model=RouterTrialResponse)
def update_router_trial(
    router_id: UUID,
    payload: RouterTrialUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> RouterTrialResponse:
    """Toggle the MikroTik hotspot free-trial window and set its duration."""
    db_router = get_router_with_ownership(session, router_id, user.id)

    db_router.trial_enabled = payload.trial_enabled
    db_router.trial_minutes = payload.trial_minutes
    db_router.updated_at = datetime.utcnow()
    session.add(db_router)
    session.commit()
    session.refresh(db_router)

    sync_error = apply_trial_settings(db_router, payload.trial_enabled, payload.trial_minutes)
    return RouterTrialResponse(
        success=sync_error is None,
        router_id=db_router.id,
        router_name=db_router.name,
        trial_enabled=db_router.trial_enabled,
        trial_minutes=db_router.trial_minutes,
        router_sync_error=sync_error,
    )


@router.delete("/routers/{router_id}", response_model=MessageResponse)
def delete_router(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MessageResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    if db_router.ppp_username or db_router.nat_rule_id or db_router.snmp_nat_rule_id:
        try:
            delete_router_from_chr(session, db_router)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not remove router from CHR: {exc}",
            ) from exc
    session.delete(db_router)
    session.commit()
    return MessageResponse(message="Router deleted successfully.")


@router.get("/routers/{router_id}/status", response_model=RouterStatusResponse)
def router_status(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterStatusResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = get_router_status(db_router)
    if not result["connected"]:
        notify_router_event(
            session,
            user.id,
            db_router.name,
            f"{db_router.name} is offline",
            f"The platform could not connect to {db_router.name}. {result['error'] or 'Check power, tunnel, and API access.'}",
            dedupe_minutes=60,
        )
    return RouterStatusResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **result,
    )


@router.get("/routers/{router_id}/features", response_model=RouterFeaturesResponse)
def router_features(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterFeaturesResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = get_router_features(db_router)
    return RouterFeaturesResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **result,
    )


def _persist_active_hotspot_user_lifecycle(session: Session, db_router: Router, active_users: list[dict]) -> None:
    active_by_code = {
        str(item.get("user") or item.get("name") or "").strip(): item
        for item in active_users
        if item.get("user") or item.get("name")
    }
    if not active_by_code:
        return

    router_name = normalize_router_name(db_router.name)
    vouchers = session.exec(
        select(VoucherPurchase)
        .where(VoucherPurchase.router_name == router_name)
        .where(col(VoucherPurchase.voucher_code).in_(list(active_by_code)))
    ).all()
    if not vouchers:
        return

    packages = session.exec(select(RouterPackage).where(RouterPackage.router_id == db_router.id)).all()
    packages_by_id = {package.package_id: package for package in packages}
    packages_by_profile = {package.profile: package for package in packages}
    changed = False

    for voucher in vouchers:
        active = active_by_code.get(voucher.voucher_code)
        if not active:
            continue

        package = packages_by_id.get(voucher.package_id) or packages_by_profile.get(voucher.profile)
        previous_status = voucher.status
        was_activated = voucher.activated_at is not None
        previous_activated_at = voucher.activated_at
        previous_expires_at = voucher.expires_at
        uptime = router_uptime_duration(active.get("uptime"))
        update_voucher_lifecycle(
            voucher,
            package_limit=package.limit if package else None,
            is_online=True,
            has_router_usage=True,
            router_uptime=uptime,
        )
        lifecycle_changed = (
            previous_status != voucher.status
            or previous_activated_at != voucher.activated_at
            or previous_expires_at != voucher.expires_at
        )
        if lifecycle_changed:
            event = "ACTIVATED" if not was_activated and voucher.activated_at is not None else "SESSION_ONLINE"
            session.add(VoucherActivationAudit(
                voucher_id=voucher.id,
                voucher_code=voucher.voucher_code,
                router_name=voucher.router_name,
                event=event,
                previous_status=previous_status,
                new_status=voucher.status,
                activated_at=voucher.activated_at,
                expires_at=voucher.expires_at,
                metadata_json={"source": "active_users_poll", "router_uptime": str(active.get("uptime") or "")},
            ))
            changed = True
        session.add(voucher)

    if changed:
        session.commit()


@router.get("/routers/{router_id}/active-users", response_model=RouterActiveUsersResponse)
def router_active_users(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterActiveUsersResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = get_active_hotspot_users(db_router)
    if result.get("connected"):
        _persist_active_hotspot_user_lifecycle(session, db_router, result.get("active_users", []))
    return RouterActiveUsersResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **result,
    )


@router.delete("/routers/{router_id}/active-users/{active_id}", response_model=MessageResponse)
def router_kick_active_user(
    router_id: UUID,
    active_id: str,
    user: CurrentUser,
    session: SessionDep,
) -> MessageResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = kick_active_hotspot_user(db_router, active_id)
    if not result["connected"]:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result["error"] or "Failed to kick out hotspot session",
        )
    return MessageResponse(message=result["message"])


@router.get("/routers/{router_id}/vouchers", response_model=RouterVouchersResponse)
def router_vouchers(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterVouchersResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = get_hotspot_vouchers(db_router)
    return RouterVouchersResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **result,
    )


@router.get("/routers/{router_id}/ip-bindings", response_model=RouterIpBindingsResponse)
def router_ip_bindings(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterIpBindingsResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = get_hotspot_ip_bindings(db_router)
    return RouterIpBindingsResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **result,
    )


@router.post("/routers/{router_id}/ip-bindings", response_model=RouterIpBindingResponse, status_code=status.HTTP_201_CREATED)
def router_create_ip_binding(
    router_id: UUID,
    payload: RouterIpBindingPayload,
    user: CurrentUser,
    session: SessionDep,
) -> RouterIpBindingResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    try:
        return RouterIpBindingResponse(**create_hotspot_ip_binding(db_router, payload.model_dump()))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not create IP binding on {db_router.name}: {exc}",
        ) from exc


@router.put("/routers/{router_id}/ip-bindings/{binding_id}", response_model=RouterIpBindingResponse)
def router_update_ip_binding(
    router_id: UUID,
    binding_id: str,
    payload: RouterIpBindingPayload,
    user: CurrentUser,
    session: SessionDep,
) -> RouterIpBindingResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    try:
        return RouterIpBindingResponse(**update_hotspot_ip_binding(db_router, binding_id, payload.model_dump()))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not update IP binding on {db_router.name}: {exc}",
        ) from exc


@router.delete("/routers/{router_id}/ip-bindings/{binding_id}", response_model=MessageResponse)
def router_delete_ip_binding(
    router_id: UUID,
    binding_id: str,
    user: CurrentUser,
    session: SessionDep,
) -> MessageResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    try:
        delete_hotspot_ip_binding(db_router, binding_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not delete IP binding on {db_router.name}: {exc}",
        ) from exc
    return MessageResponse(message="IP binding deleted")


@router.get("/routers/{router_id}/logs", response_model=RouterLogsResponse)
def router_logs(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=200, ge=1, le=1000),
) -> RouterLogsResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    return RouterLogsResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **get_router_logs(db_router, limit),
    )


@router.get("/routers/{router_id}/remote-access", response_model=RouterRemoteAccessResponse)
def router_remote_access(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterRemoteAccessResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    if db_router.winbox_nat_port is None and db_router.status in {"connected", "online"}:
        try:
            db_router = ensure_winbox_forwarding(session, db_router)
        except Exception:
            pass
    return RouterRemoteAccessResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **get_remote_winbox_access(db_router),
    )


@router.get("/routers/{router_id}/secure-setup", response_model=RouterSecureSetupResponse)
def router_secure_setup(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    response: Response,
    api_base_url: str = Query(default=settings.portal_public_api_url, min_length=8, max_length=500),
) -> RouterSecureSetupResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    response.headers["Cache-Control"] = "no-store"
    try:
        script = build_secure_setup_script(db_router, api_base_url)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return RouterSecureSetupResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        host=db_router.host,
        api_port=db_router.port,
        api_username=db_router.username,
        api_password=decrypt_secret(db_router.password),
        allowed_source=f"{CHR_TUNNEL_ADDRESS}/32",
        script=script,
        warning=(
            "Run this from a trusted local Winbox/terminal session. The script changes "
            "management services and disables the factory admin account."
        ),
    )


@router.post("/routers/{router_id}/publish-setup-script", response_model=RouterPublishScriptResponse)
def publish_router_setup_script(
    router_id: UUID,
    payload: RouterPublishScriptRequest,
    user: CurrentUser,
    session: SessionDep,
    response: Response,
) -> RouterPublishScriptResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    response.headers["Cache-Control"] = "no-store"
    try:
        script = build_secure_setup_script(
            db_router,
            payload.api_base_url,
            include_walled_garden=payload.include_walled_garden,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    script_key = f"router-scripts/{router_id}.rsc"
    try:
        upload_bytes(script_key, script.encode("utf-8"), content_type="text/plain; charset=utf-8")
        url = object_url(script_key, expires_in=48 * 3600)
    except STORAGE_ERRORS as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"R2 upload failed: {exc}",
        ) from exc

    # The MikroTik CLI treats "?" as an interactive help/autocomplete hotkey, which
    # corrupts pasted commands containing presigned R2 URLs (their "?X-Amz-..." query
    # string gets swallowed mid-paste). Route the import through our own backend
    # using a path-only token so the customer's command never contains a "?".
    api_base = payload.api_base_url.rstrip("/")
    fetch_token = registration_token(db_router.id)
    fetch_url = f"{api_base}/api/routers/script/{fetch_token}.rsc"

    return RouterPublishScriptResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        script_url=url,
        mikrotik_v7_command=f'/import url="{fetch_url}"',
        mikrotik_v6_command=(
            f'/tool fetch url="{fetch_url}" dst-path=tresa-setup.rsc; '
            ":delay 25s; /import file-name=tresa-setup.rsc"
        ),
        expires_note=(
            "Script contains a 48-hour registration token. "
            "Regenerate if the customer has not run it within that window."
        ),
    )


@router.post("/api/routers/register", response_model=RouterRegisterResponse)
def public_router_register(
    payload: RouterRegisterRequest,
    session: SessionDep,
) -> RouterRegisterResponse:
    try:
        _, result = register_router(
            session,
            payload.token,
            payload.mac,
            payload.model,
            payload.version,
            payload.serial,
        )
        return RouterRegisterResponse(**result)
    except Exception as exc:
        log_error(session, "public_router_register", exc)
        return JSONResponse(content={"status": "error", "error": str(exc)})


@router.post("/api/routers/set-credentials")
def public_router_set_credentials(
    payload: RouterCredentialsRequest,
    session: SessionDep,
) -> dict[str, str]:
    try:
        save_router_credentials(
            session,
            payload.token,
            payload.mac,
            payload.api_user,
            payload.api_pass,
        )
        return {"status": "saved"}
    except Exception as exc:
        log_error(session, "public_router_set_credentials", exc)
        return JSONResponse(content={"status": "error", "error": str(exc)})


@router.post("/api/routers/confirm", response_model=RouterProvisionResponse)
def public_router_confirm(
    payload: RouterConfirmRequest,
    session: SessionDep,
) -> RouterProvisionResponse:
    try:
        db_router = confirm_router(session, payload.token, payload.mac)
        send_branch_event(
            session,
            db_router.branch_id,
            "router",
            (
                "<b>Router activated</b>\n"
                f"Router: {db_router.name}\n"
                f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC"
            ),
        )
        return RouterProvisionResponse(
            router_id=db_router.id,
            status="provisioned",
            nat_port=db_router.nat_port or 0,
            tunnel_ip=db_router.tunnel_ip or "",
        )
    except Exception as exc:
        log_error(session, "public_router_confirm", exc)
        return JSONResponse(content={"status": "error", "error": str(exc)})


@router.post("/api/routers/heartbeat", response_model=RouterHeartbeatResponse)
def public_router_heartbeat(
    payload: RouterHeartbeatRequest,
    session: SessionDep,
) -> RouterHeartbeatResponse:
    try:
        router_id = verify_heartbeat_token(payload.token)
        db_router = session.get(Router, router_id)
        if not db_router:
            raise ValueError("Router not found")
        expected_mac = "".join(character for character in (db_router.mac_address or "").upper() if character.isalnum())
        supplied_mac = "".join(character for character in payload.mac.upper() if character.isalnum())
        if expected_mac and expected_mac != supplied_mac:
            raise ValueError("Router MAC address does not match")
        heartbeat_status = record_heartbeat(session, db_router, payload.uptime)
        return RouterHeartbeatResponse(status=heartbeat_status, server_time=datetime.utcnow())
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc


@router.get("/api/routers/script/{token}.rsc", response_class=PlainTextResponse)
def public_router_setup_script(token: str, session: SessionDep) -> PlainTextResponse:
    try:
        router_id = verify_registration_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db_router = session.get(Router, router_id)
    if db_router is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")

    api_base_url = settings.portal_public_api_url
    try:
        script = build_secure_setup_script(db_router, api_base_url, include_walled_garden=True)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return PlainTextResponse(script, media_type="text/plain")


@router.post("/api/routers/provision", response_model=RouterProvisionResponse)
def manual_router_provision(
    payload: RouterProvisionRequest,
    user: CurrentUser,
    session: SessionDep,
) -> RouterProvisionResponse:
    db_router = session.exec(
        select(Router).where(Router.ppp_username == payload.ppp_username)
    ).first()
    if not db_router:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PPP router not found")
    check_branch_ownership(session, db_router.branch_id, user.id)
    try:
        db_router = provision_router(session, db_router)
    except Exception as exc:
        log_error(session, "manual_router_provision", exc, db_router)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return RouterProvisionResponse(
        router_id=db_router.id,
        status=db_router.status,
        nat_port=db_router.nat_port or 0,
        tunnel_ip=db_router.tunnel_ip or "",
    )


@router.get("/api/routers/{router_id}/status")
def concentrator_router_status(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> dict:
    db_router = get_router_with_ownership(session, router_id, user.id)
    return {
        "router_id": db_router.id,
        "customer": db_router.ppp_username,
        "status": db_router.status,
        "tunnel_ip": db_router.tunnel_ip,
        "nat_port": db_router.nat_port,
        "connected_at": db_router.connected_at,
        "disconnected_at": db_router.disconnected_at,
        "last_seen": db_router.last_seen,
    }


@router.get("/api/routers/{router_id}/resource", response_model=RouterResourceResponse)
def concentrator_router_resource(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterResourceResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    try:
        resource = router_resource(db_router)
    except Exception as exc:
        log_error(session, "concentrator_router_resource", exc, db_router)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return RouterResourceResponse(
        router_id=db_router.id,
        status=db_router.status,
        resource=resource,
    )


@router.post("/api/routers/{router_id}/command", response_model=RouterCommandResponse)
def concentrator_router_command(
    router_id: UUID,
    payload: RouterCommandRequest,
    user: CurrentUser,
    session: SessionDep,
) -> RouterCommandResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    try:
        result = run_safe_command(db_router, payload.path, payload.action, payload.params)
    except ValueError as exc:
        log_error(session, "concentrator_router_command", exc, db_router)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        log_error(session, "concentrator_router_command", exc, db_router)
        code = status.HTTP_429_TOO_MANY_REQUESTS if "rate limit" in str(exc).lower() else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    return RouterCommandResponse(router_id=db_router.id, result=result)


@router.delete("/api/routers/{router_id}", response_model=MessageResponse)
def concentrator_delete_router(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MessageResponse:
    return delete_router(router_id, user, session)


@router.websocket("/api/routers/events")
async def router_events(websocket: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = decode_access_token(token)
        user_id = UUID(payload["sub"])
        with Session(engine) as session:
            if not session.get(User, user_id):
                await websocket.close(code=4401)
                return
        await router_event_hub.connect(user_id, websocket)
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, HTTPException, KeyError, ValueError):
        pass
    finally:
        if "user_id" in locals():
            router_event_hub.disconnect(user_id, websocket)


@router.post("/routers/{router_id}/ping", response_model=RouterPingResponse)
def router_ping(
    router_id: UUID,
    payload: RouterPingRequest,
    user: CurrentUser,
    session: SessionDep,
) -> RouterPingResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    target = payload.target.strip() if payload.target else "8.8.8.8"
    result = ping_from_router(db_router, target)
    if not result["reachable"]:
        notify_router_event(
            session,
            user.id,
            db_router.name,
            f"Ping failed on {db_router.name}",
            f"{db_router.name} could not reach {target}. {result['error'] or ''}".strip(),
            dedupe_minutes=30,
        )
    return RouterPingResponse(**result)


@router.post("/routers/{router_id}/reboot", response_model=RouterRebootResponse)
def router_reboot(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterRebootResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = reboot_router(db_router)
    if result["success"]:
        notify_router_event(
            session,
            user.id,
            db_router.name,
            f"{db_router.name} reboot requested",
            "The MikroTik accepted a reboot command. It may remain offline for several minutes.",
        )
        message = "Reboot command accepted by MikroTik."
    else:
        notify_router_event(
            session,
            user.id,
            db_router.name,
            f"{db_router.name} reboot failed",
            result["error"] or "The MikroTik rejected the reboot command.",
            dedupe_minutes=15,
        )
        message = "MikroTik reboot failed."
    return RouterRebootResponse(
        success=result["success"],
        router_id=db_router.id,
        router_name=db_router.name,
        message=message,
        error=result["error"],
    )


@router.post("/routers/{router_id}/deploy-heartbeat", response_model=RouterDeployHeartbeatResponse)
def deploy_router_heartbeat(
    router_id: UUID,
    payload: RouterDeployHeartbeatRequest,
    user: CurrentUser,
    session: SessionDep,
) -> RouterDeployHeartbeatResponse:
    db_router = get_router_with_ownership(session, router_id, user.id)
    try:
        deploy_heartbeat_monitor(db_router, payload.api_base_url)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        return RouterDeployHeartbeatResponse(
            success=False,
            router_id=db_router.id,
            router_name=db_router.name,
            message="Could not reach the router's API to install the heartbeat scheduler.",
            error=str(exc),
        )
    return RouterDeployHeartbeatResponse(
        success=True,
        router_id=db_router.id,
        router_name=db_router.name,
        message="Heartbeat script installed. The router will report status every minute.",
    )


@router.post("/routers/test-connection", response_model=RouterTestConnectionResponse)
def test_router_connection(
    payload: RouterTestConnectionRequest,
    user: CurrentUser,
) -> RouterTestConnectionResponse:
    result = test_connection(
        host=payload.host.strip(),
        port=payload.port,
        username=payload.username.strip(),
        password=payload.password,
        plaintext_login=payload.plaintext_login,
    )
    return RouterTestConnectionResponse(**result)


# ── Hotspot Provisioning ─────────────────────────────────────


@router.get("/routers/{router_id}/hardware", response_model=RouterHardwareResponse)
def router_hardware(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterHardwareResponse:
    """Detect physical hardware: port count, interface names, wireless capability."""
    db_router = get_router_with_ownership(session, router_id, user.id)
    hw = detect_router_hardware(db_router)
    return RouterHardwareResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        identity=hw["identity"],
        ethernet_ports=hw["ethernet_ports"],
        has_wireless=hw["has_wireless"],
        wireless_interfaces=hw["wireless_interfaces"],
        port_count=hw["port_count"],
        error=hw["error"],
    )


@router.post("/routers/{router_id}/provision-hotspot", response_model=HotspotProvisionResponse)
def router_provision_hotspot(
    router_id: UUID,
    payload: HotspotProvisionConfig,
    user: CurrentUser,
    session: SessionDep,
) -> HotspotProvisionResponse:
    """
    Provision the router for hotspot / PPPoE.

    Detects hardware, generates configuration commands, and executes them
    via the RouterOS API.  Adapts automatically to the router's port count
    and wireless capability.
    """
    db_router = get_router_with_ownership(session, router_id, user.id)
    result = provision_hotspot(db_router, payload)
    if result.get("success") and not db_router.hotspot_provisioned:
        db_router.hotspot_provisioned = True
        db_router.updated_at = datetime.utcnow()
        session.add(db_router)
        session.commit()
    return HotspotProvisionResponse(
        router_id=db_router.id,
        router_name=db_router.name,
        **result,
    )
