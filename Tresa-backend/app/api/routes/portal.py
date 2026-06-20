from datetime import datetime
from html import escape
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlmodel import select

from app.api.deps import CurrentUser
from app.db.session import SessionDep
from app.models.branch import Branch
from app.models.captive_portal import CaptivePortal
from app.models.portal_ad import PortalAd
from app.models.router import Router
from app.models.staff import Staff
from app.models.voucher_purchase import VoucherPurchase
from app.schemas.portal import (
    CaptivePortalDeployResponse,
    CaptivePortalPushRequest,
    CaptivePortalResponse,
    CaptivePortalUpsert,
    PortalFindVoucherResponse,
    PortalPaymentCreate,
    PortalPaymentInitResponse,
    PortalPaymentStatusResponse,
    PortalVoucherResponse,
    PushCaptiveResponse,
)
from app.services.portal import (
    deploy_captive_portal_via_fetch,
    find_router_by_name,
    find_vouchers,
    get_public_captive_config,
    initiate_portal_payment,
    normalize_router_name,
    portal_deployment_file,
    push_captive_files_to_mikrotik,
    refresh_portal_payment,
)
from app.services.routers.Packages import get_router_packages
from app.services.storage import refresh_logo_url
from app.services.telegram import send_branch_event

router = APIRouter(tags=["Portal"])


def notify_adsmob_publish(
    session: SessionDep,
    db_router: Router,
    file_count: int,
    diagnostics: dict[str, str],
) -> int:
    active_ads = session.exec(
        select(PortalAd)
        .where(PortalAd.router_id == db_router.id)
        .where(PortalAd.enabled.is_(True))
    ).all()
    walled_hosts = [
        host
        for host in diagnostics.get("walled_garden_hosts", "").split(",")
        if host
    ]
    return send_branch_event(
        session,
        db_router.branch_id,
        "ads_publish",
        (
            "<b>AdsMob portal published</b>\n"
            f"Router: <b>{escape(db_router.name)}</b>\n"
            f"Active ads: <b>{len(active_ads)}</b>\n"
            f"Portal files: <b>{file_count}</b>\n"
            f"Walled-garden hosts: <b>{len(walled_hosts)}</b>"
        ),
    )


def check_router_ownership(session: SessionDep, router_id: UUID, user_id: UUID) -> Router:
    db_router = session.get(Router, router_id)
    if not db_router:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")

    branch = session.get(Branch, db_router.branch_id)
    if branch and branch.user_id != user_id:
        staff = session.exec(
            select(Staff)
            .where(Staff.user_id == user_id)
            .where(Staff.branch_id == branch.id)
            .where(Staff.is_active.is_(True))
        ).first()
        if not staff or "captive" not in set(staff.permissions.split(",")):
            branch = None
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found or access denied")
    return db_router


def serialize_captive(captive: CaptivePortal) -> CaptivePortalResponse:
    return CaptivePortalResponse(
        id=captive.id,
        router_id=captive.router_id,
        router_name=captive.router_name,
        title=captive.title,
        description=captive.description,
        phone_one=captive.phone_one,
        phone_two=captive.phone_two,
        logo_url=refresh_logo_url(captive.logo_url),
        primary_color=captive.primary_color,
        portal_template=captive.portal_template,
        last_pushed_at=captive.last_pushed_at,
    )


def serialize_voucher(voucher) -> PortalVoucherResponse:
    return PortalVoucherResponse(
        id=voucher.id,
        router_name=voucher.router_name,
        phone_number=voucher.phone_number,
        voucher_code=voucher.voucher_code,
        package_id=voucher.package_id,
        profile=voucher.profile,
        speed_type=voucher.speed_type,
        amount=voucher.amount,
        devices=voucher.devices,
        data=voucher.data,
        status=voucher.status,
        payment_reference=voucher.payment_reference,
        created_at=voucher.created_at,
    )


@router.get("/portal/{router_name}", response_model=CaptivePortalResponse)
def public_captive_config(
    router_name: str,
    session: SessionDep,
) -> CaptivePortalResponse:
    return CaptivePortalResponse(**get_public_captive_config(session, router_name))


@router.get("/portal/{router_name}/deployment-files/{remote_name:path}")
def public_portal_deployment_file(
    router_name: str,
    remote_name: str,
    session: SessionDep,
) -> Response:
    rendered = portal_deployment_file(session, router_name, remote_name)
    if not rendered:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Portal file not found")
    content, content_type = rendered
    return Response(
        content=content,
        media_type=content_type.split(";", 1)[0],
        headers={"Cache-Control": "no-store"},
    )


@router.get("/portal/{router_name}/packages")
def public_captive_packages(router_name: str, session: SessionDep):
    db_router = find_router_by_name(session, router_name)
    lookup_name = db_router.name if db_router else router_name
    return {"success": True, "data": get_router_packages(lookup_name, session)}


@router.post("/portal/{router_name}/payments", response_model=PortalPaymentInitResponse)
def public_portal_payment(
    router_name: str,
    payload: PortalPaymentCreate,
    session: SessionDep,
) -> PortalPaymentInitResponse:
    try:
        payment = initiate_portal_payment(
            session=session,
            router_name=router_name,
            phone_number=payload.phone_number,
            package_id=payload.package_id,
            buy_for=payload.buy_for,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    message = None
    if payment.status == "PENDING":
        message = "Check your phone and approve the mobile money payment prompt."
    elif payment.status == "FAILED":
        message = payment.error or "The payment could not be started. Please try again."

    return PortalPaymentInitResponse(
        success=payment.status != "FAILED",
        reference=payment.reference,
        status=payment.status,
        message=message,
    )


@router.get("/portal/{router_name}/payments/{reference}", response_model=PortalPaymentStatusResponse)
def public_portal_payment_status(
    router_name: str,
    reference: UUID,
    session: SessionDep,
) -> PortalPaymentStatusResponse:
    try:
        payment = refresh_portal_payment(session, router_name, reference)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    voucher_response = None
    if payment.voucher_id:
        voucher = session.get(VoucherPurchase, payment.voucher_id)
        if voucher:
            voucher_response = serialize_voucher(voucher)

    message = None
    if payment.status == "PENDING":
        message = "Waiting for mobile money confirmation. Check your phone and enter your PIN."
    elif payment.status == "FAILED":
        message = payment.error or "The payment was not completed."
    elif payment.status == "SUCCESS" and not voucher_response:
        message = payment.error or "Payment confirmed, finishing setup..."

    return PortalPaymentStatusResponse(
        success=payment.status != "FAILED",
        status=payment.status,
        voucher=voucher_response,
        message=message,
    )


@router.get("/portal/{router_name}/vouchers/find", response_model=PortalFindVoucherResponse)
def public_find_voucher(
    router_name: str,
    session: SessionDep,
    phone_number: str = Query(min_length=5, max_length=30),
) -> PortalFindVoucherResponse:
    vouchers = find_vouchers(session, router_name, phone_number)
    return PortalFindVoucherResponse(
        success=True,
        vouchers=[serialize_voucher(voucher) for voucher in vouchers],
    )


@router.get("/routers/{router_id}/captive", response_model=CaptivePortalResponse)
def get_router_captive(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> CaptivePortalResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    captive = session.exec(select(CaptivePortal).where(CaptivePortal.router_id == db_router.id)).first()
    if not captive:
        return CaptivePortalResponse(**get_public_captive_config(session, db_router.name))
    return serialize_captive(captive)


@router.put("/routers/{router_id}/captive", response_model=CaptivePortalResponse)
def upsert_router_captive(
    router_id: UUID,
    payload: CaptivePortalUpsert,
    user: CurrentUser,
    session: SessionDep,
) -> CaptivePortalResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    captive = session.exec(select(CaptivePortal).where(CaptivePortal.router_id == db_router.id)).first()
    if not captive:
        captive = CaptivePortal(router_id=db_router.id, router_name=normalize_router_name(db_router.name))

    captive.router_name = normalize_router_name(db_router.name)
    captive.title = payload.title.strip()
    captive.description = payload.description.strip()
    captive.phone_one = payload.phone_one.strip() if payload.phone_one else None
    captive.phone_two = payload.phone_two.strip() if payload.phone_two else None
    captive.logo_url = payload.logo_url.strip() if payload.logo_url else None
    captive.primary_color = payload.primary_color.strip() if payload.primary_color else None
    captive.portal_template = payload.portal_template.strip()
    captive.updated_at = datetime.utcnow()
    session.add(captive)
    session.commit()
    session.refresh(captive)
    return serialize_captive(captive)


@router.post("/routers/{router_id}/captive/push", response_model=PushCaptiveResponse)
def push_router_captive(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    payload: CaptivePortalPushRequest | None = None,
) -> PushCaptiveResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    payload = payload or CaptivePortalPushRequest()
    captive = session.exec(select(CaptivePortal).where(CaptivePortal.router_id == db_router.id)).first()
    template = captive.portal_template if captive else "renault"
    result = push_captive_files_to_mikrotik(
        db_router,
        template,
        ftp_username=payload.ftp_username,
        ftp_password=payload.ftp_password,
        ftp_port=payload.ftp_port,
        session=session,
    )

    if captive and result["success"]:
        captive.last_pushed_at = datetime.utcnow()
        captive.router_name = normalize_router_name(db_router.name)
        captive.updated_at = datetime.utcnow()
        session.add(captive)
        session.commit()

    if result["success"] and template == "adsmob":
        recipients = notify_adsmob_publish(
            session,
            db_router,
            len(result["pushed_files"]),
            result.get("diagnostics", {}),
        )
        result.setdefault("diagnostics", {})["telegram_recipients"] = str(recipients)

    return PushCaptiveResponse(
        success=result["success"],
        router_id=db_router.id,
        router_name=db_router.name,
        pushed_files=result["pushed_files"],
        deployed_directory=result.get("deployed_directory"),
        updated_profiles=result.get("updated_profiles", []),
        error=result["error"],
        diagnostics=result.get("diagnostics", {}),
    )


@router.post("/routers/{router_id}/captive/deploy-r2", response_model=CaptivePortalDeployResponse)
def deploy_router_captive_r2(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> CaptivePortalDeployResponse:
    """Auto-deploy the captive portal: host it on R2, then have the router pull it via /tool fetch."""
    db_router = check_router_ownership(session, router_id, user.id)
    captive = session.exec(select(CaptivePortal).where(CaptivePortal.router_id == db_router.id)).first()
    template = captive.portal_template if captive else "renault"
    result = deploy_captive_portal_via_fetch(db_router, template, session=session)

    if captive and result["success"]:
        captive.last_pushed_at = datetime.utcnow()
        captive.router_name = normalize_router_name(db_router.name)
        captive.updated_at = datetime.utcnow()
        session.add(captive)
        session.commit()

    if result["success"] and template == "adsmob":
        recipients = notify_adsmob_publish(
            session,
            db_router,
            len(result["fetched_files"]),
            result.get("diagnostics", {}),
        )
        result.setdefault("diagnostics", {})["telegram_recipients"] = str(recipients)

    return CaptivePortalDeployResponse(
        success=result["success"],
        router_id=db_router.id,
        router_name=db_router.name,
        fetched_files=result["fetched_files"],
        deployed_directory=result.get("deployed_directory"),
        updated_profiles=result.get("updated_profiles", []),
        error=result["error"],
        diagnostics=result.get("diagnostics", {}),
    )


@router.get("/portal/router/{router_name}/exists")
def public_router_exists(router_name: str, session: SessionDep):
    db_router = find_router_by_name(session, router_name)
    return {
        "success": True,
        "router_name": normalize_router_name(db_router.name) if db_router else normalize_router_name(router_name),
        "exists": db_router is not None,
    }
