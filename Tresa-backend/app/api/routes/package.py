import secrets
import re
from datetime import datetime
from html import escape
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlmodel import Session, col, select

from app.api.deps import CurrentUser
from app.db.session import SessionDep, engine
from app.models.branch import Branch
from app.models.notification import Notification
from app.models.router import Router
from app.models.router_package import RouterPackage
from app.models.staff import Staff
from app.models.user import User
from app.models.voucher_purchase import VoucherPurchase
from app.models.voucher_job import VoucherJob
from app.models.platform_admin import VoucherActivationAudit
from app.schemas.package import (
    RouterPackageCreate,
    RouterPackageMutationResponse,
    RouterPackageSyncResponse,
    RouterPackageUpdate,
    RouterPackagesResponse,
    VoucherBatchCreate,
    VoucherBatchItemResponse,
    VoucherBatchResponse,
    VoucherCustomerInsight,
    VoucherExpiryCheckResponse,
    VoucherListResponse,
    VoucherJobCreatedResponse,
    VoucherJobResponse,
    VoucherSupportSummaryResponse,
    VoucherRouterSyncResponse,
    VoucherDeleteResponse,
)
from app.services.portal import (
    _delete_hotspot_vouchers,
    _upsert_hotspot_voucher,
    _upsert_hotspot_vouchers,
    find_router_by_name,
    get_or_create_wallet,
    normalize_phone,
)
from app.services.routers.routeros import get_active_hotspot_users, get_hotspot_vouchers
from app.services.routers.Packages import (
    create_router_package,
    get_router_packages,
    serialize_package,
    sync_packages_from_mikrotik,
    update_router_package,
)
from app.services.telegram import send_branch_event
from app.services.voucher_lifecycle import router_uptime_duration, update_voucher_lifecycle
from app.services.platform_admin import get_setting

router = APIRouter(tags=["Packages"])


def normalize_router_name(router_name: str) -> str:
    return router_name.strip().upper()


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
        permissions = set((staff.permissions if staff else "").split(","))
        if not staff or not ({"vouchers", "sales"} & permissions):
            branch = None
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found or access denied")
    return db_router


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
        if not staff or not ({"vouchers", "sales"} & permissions):
            branch = None
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found or access denied")
    return branch


def branch_router_names(session: SessionDep, branch_id: UUID) -> list[str]:
    routers = session.exec(select(Router).where(Router.branch_id == branch_id)).all()
    return [normalize_router_name(router.name) for router in routers]


def branch_routers(session: SessionDep, branch_id: UUID) -> list[Router]:
    return session.exec(select(Router).where(Router.branch_id == branch_id)).all()


def get_owned_package(session: SessionDep, router: Router, package_id: int) -> RouterPackage:
    package = session.get(RouterPackage, package_id)
    if not package or package.router_id != router.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Package not found")
    return package


@router.get("/packages", response_model=RouterPackagesResponse)
def list_router_packages(
    session: SessionDep,
    router_id: str = Query(min_length=1, max_length=120),
) -> RouterPackagesResponse:
    db_router = find_router_by_name(session, router_id)
    lookup_name = db_router.name if db_router else router_id
    return RouterPackagesResponse(
        success=True,
        data=get_router_packages(lookup_name, session),
    )


@router.get("/routers/{router_id}/packages", response_model=RouterPackagesResponse)
def list_owned_router_packages(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterPackagesResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    return RouterPackagesResponse(
        success=True,
        data=get_router_packages(db_router.name, session),
    )


@router.post("/routers/{router_id}/packages", response_model=RouterPackageMutationResponse, status_code=status.HTTP_201_CREATED)
def add_router_package(
    router_id: UUID,
    payload: RouterPackageCreate,
    user: CurrentUser,
    session: SessionDep,
) -> RouterPackageMutationResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    package, sync_error = create_router_package(session, db_router, payload)
    return RouterPackageMutationResponse(
        success=sync_error is None,
        package=serialize_package(package),
        router_sync_error=sync_error,
    )


@router.put("/routers/{router_id}/packages/{package_row_id}", response_model=RouterPackageMutationResponse)
def edit_router_package(
    router_id: UUID,
    package_row_id: int,
    payload: RouterPackageUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> RouterPackageMutationResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    package = get_owned_package(session, db_router, package_row_id)
    package, sync_error = update_router_package(session, db_router, package, payload)
    return RouterPackageMutationResponse(
        success=sync_error is None,
        package=serialize_package(package),
        router_sync_error=sync_error,
    )


@router.delete("/routers/{router_id}/packages/{package_row_id}")
def delete_router_package(
    router_id: UUID,
    package_row_id: int,
    user: CurrentUser,
    session: SessionDep,
):
    db_router = check_router_ownership(session, router_id, user.id)
    package = get_owned_package(session, db_router, package_row_id)
    session.delete(package)
    session.commit()
    return {"message": "Package deleted successfully."}


@router.post("/routers/{router_id}/packages/sync", response_model=RouterPackageSyncResponse)
def sync_router_packages(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RouterPackageSyncResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    packages, error = sync_packages_from_mikrotik(session, db_router)
    return RouterPackageSyncResponse(
        success=error is None,
        router_id=db_router.id,
        router_name=db_router.name,
        imported=len(packages),
        packages=[serialize_package(package) for package in packages],
        error=error,
    )


def _clean_voucher_affix(value: str | None) -> str:
    return re.sub(r"[-\s]+", "", str(value or "").strip())


def _voucher_code(length: int, code_format: str, prefix: str, postfix: str = "") -> str:
    upper_alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    lower_alpha = "abcdefghjkmnpqrstuvwxyz"
    mixed_alpha = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    numeric = "0123456789"
    charset = upper_alpha + numeric
    if code_format == "numeric":
        charset = numeric
    elif code_format == "alphanumeric-lower":
        charset = lower_alpha + numeric
    elif code_format == "alphanumeric-mixed":
        charset = mixed_alpha
    token = "".join(secrets.choice(charset) for _ in range(length))
    return f"{prefix}{token}{postfix}"


def _unique_voucher_codes(
    session: SessionDep,
    payload: VoucherBatchCreate,
    prefix: str,
    postfix: str = "",
) -> list[str]:
    codes: set[str] = set()
    while len(codes) < payload.quantity:
        codes.add(_voucher_code(payload.code_length, payload.code_format, prefix, postfix))

    while True:
        existing = set(
            session.exec(
                select(VoucherPurchase.voucher_code)
                .where(col(VoucherPurchase.voucher_code).in_(codes))
            ).all()
        )
        if not existing:
            return list(codes)
        codes.difference_update(existing)
        while len(codes) < payload.quantity:
            codes.add(_voucher_code(payload.code_length, payload.code_format, prefix, postfix))


def serialize_voucher(voucher: VoucherPurchase) -> VoucherBatchItemResponse:
    return VoucherBatchItemResponse(
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
        activated_at=voucher.activated_at,
        expires_at=voucher.expires_at,
    )


def notify_branch_staff(session: SessionDep, branch: Branch, title: str, body: str, category: str = "vouchers") -> None:
    user_ids = {branch.user_id}
    staff = session.exec(select(Staff).where(Staff.branch_id == branch.id)).all()
    staff_emails = [item.email for item in staff if item.email]
    if staff_emails:
        users = session.exec(select(User).where(col(User.email).in_(staff_emails))).all()
        user_ids.update(user.id for user in users)

    for user_id in user_ids:
        session.add(Notification(user_id=user_id, category=category, title=title, body=body))


def _create_router_vouchers(
    db_router: Router,
    payload: VoucherBatchCreate,
    session: Session,
    progress=None,
) -> VoucherBatchResponse:
    def report(percent: int, stage: str, message: str) -> None:
        if progress:
            progress(percent, stage, message)

    branch = session.get(Branch, db_router.branch_id)
    package = session.exec(
        select(RouterPackage)
        .where(RouterPackage.router_id == db_router.id)
        .where(RouterPackage.package_id == payload.package_id)
    ).first()
    if not package:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Package not found for this router")

    report(10, "Generating", f"Generating {payload.quantity} unique voucher codes")
    phone_number = normalize_phone(payload.phone_number or "BULK")
    wallet = get_or_create_wallet(session, db_router.name, phone_number)
    vouchers: list[VoucherPurchase] = []
    package_dict = serialize_package(package)
    user_prefix = _clean_voucher_affix(payload.prefix)
    user_postfix = _clean_voucher_affix(payload.postfix)
    admin_affix = _clean_voucher_affix(str(get_setting(session, "voucher_prefix", "")))
    prefix_order = str(get_setting(session, "voucher_prefix_order", "prefix-first"))
    effective_prefix = user_prefix
    effective_postfix = user_postfix
    if not user_prefix and not user_postfix and admin_affix:
        if prefix_order == "prefix-last":
            effective_postfix = admin_affix
        else:
            effective_prefix = admin_affix

    for code in _unique_voucher_codes(session, payload, effective_prefix, effective_postfix):
        voucher = VoucherPurchase(
            wallet_id=wallet.id,
            router_name=normalize_router_name(db_router.name),
            phone_number=phone_number,
            voucher_code=code,
            package_id=package.package_id,
            profile=package.profile,
            speed_type=package.speed_type,
            amount=payload.amount if payload.amount is not None else int(package.total or 0),
            devices=package.devices,
            data=package.data,
            status="CREATED",
            payment_reference=payload.payment_reference,
        )
        session.add(voucher)
        vouchers.append(voucher)

    report(25, "MikroTik", f"Adding {len(vouchers)} hotspot users to {db_router.name}")
    sync_errors: dict[str, str] = {}
    try:
        sync_errors = _upsert_hotspot_vouchers(db_router, vouchers, package_dict)
    except Exception as exc:
        sync_errors = {voucher.voucher_code: str(exc) for voucher in vouchers}

    report(55, "Database", "Saving voucher records to PostgreSQL")
    for voucher in vouchers:
        voucher.status = "PROVISIONED" if voucher.voucher_code not in sync_errors else "ROUTER_SYNC_FAILED"
        session.add(voucher)
    if branch:
        notify_branch_staff(
            session,
            branch,
            title="Voucher batch created",
            body=f"{len(vouchers)} voucher(s) created for {db_router.name} using package {package.profile}.",
        )
    session.commit()
    if branch:
        code_preview = ", ".join(voucher.voucher_code for voucher in vouchers[:10])
        if len(vouchers) > 10:
            code_preview += f" and {len(vouchers) - 10} more"
        send_branch_event(
            session,
            branch.id,
            "voucher_batch",
            (
                "<b>Voucher batch created</b>\n"
                f"Router: {escape(db_router.name)}\n"
                f"Package: {escape(package.profile)}\n"
                f"Quantity: {len(vouchers)}\n"
                f"Codes: <code>{escape(code_preview)}</code>"
            ),
        )

    report(80, "Verifying", "Reading hotspot users back from MikroTik")
    verified_codes: set[str] = set()
    verification = get_hotspot_vouchers(db_router)
    if verification["connected"]:
        verified_codes = {
            str(item.get("name", "")).strip()
            for item in verification["vouchers"]
            if item.get("name")
        }

    missing = 0
    for voucher in vouchers:
        if voucher.voucher_code in verified_codes:
            voucher.status = "PROVISIONED"
        else:
            voucher.status = "ROUTER_MISSING" if voucher.voucher_code not in sync_errors else "ROUTER_SYNC_FAILED"
            missing += 1
        session.add(voucher)
    session.commit()
    for voucher in vouchers:
        session.refresh(voucher)

    report(95, "Finalizing", f"Verified {len(vouchers) - missing} of {len(vouchers)} vouchers on MikroTik")
    router_error = None
    if sync_errors:
        router_error = f"{len(sync_errors)} voucher(s) failed to sync. {next(iter(sync_errors.values()))}"
    elif missing:
        router_error = f"{missing} voucher(s) were not found during router verification"

    return VoucherBatchResponse(
        success=router_error is None,
        count=len(vouchers),
        vouchers=[serialize_voucher(voucher) for voucher in vouchers],
        router_sync_error=router_error,
    )


@router.post("/routers/{router_id}/vouchers", response_model=VoucherBatchResponse, status_code=status.HTTP_201_CREATED)
def create_router_vouchers(
    router_id: UUID,
    payload: VoucherBatchCreate,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherBatchResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    return _create_router_vouchers(db_router, payload, session)


def _run_voucher_job(job_id: UUID) -> None:
    with Session(engine) as session:
        job = session.get(VoucherJob, job_id)
        if not job:
            return

        def update(percent: int, stage: str, message: str) -> None:
            session.refresh(job)
            job.status = "RUNNING" if percent < 100 else "COMPLETED"
            job.progress = percent
            job.stage = stage
            job.message = message
            job.events = [*job.events, {"time": datetime.utcnow().isoformat(), "stage": stage, "message": message}]
            job.updated_at = datetime.utcnow()
            if percent == 100:
                job.completed_at = datetime.utcnow()
            session.add(job)
            session.commit()

        try:
            update(2, "Starting", "Voucher worker started")
            db_router = session.get(Router, job.router_id)
            if not db_router:
                raise RuntimeError("Router no longer exists")
            result = _create_router_vouchers(
                db_router,
                VoucherBatchCreate.model_validate(job.payload),
                session,
                update,
            )
            session.refresh(job)
            job.result = result.model_dump(mode="json")
            job.status = "COMPLETED" if result.success else "COMPLETED_WITH_ERRORS"
            job.progress = 100
            job.stage = "Complete"
            job.message = f"Created {result.count} vouchers and completed MikroTik verification"
            job.events = [*job.events, {"time": datetime.utcnow().isoformat(), "stage": "Complete", "message": job.message}]
            job.updated_at = datetime.utcnow()
            job.completed_at = datetime.utcnow()
            session.add(job)
            session.commit()
        except Exception as exc:
            session.rollback()
            job = session.get(VoucherJob, job_id)
            if not job:
                return
            job.status = "FAILED"
            job.stage = "Failed"
            job.message = str(exc)
            job.error = str(exc)
            job.updated_at = datetime.utcnow()
            job.completed_at = datetime.utcnow()
            job.events = [*job.events, {"time": datetime.utcnow().isoformat(), "stage": "Failed", "message": str(exc)}]
            session.add(job)
            session.commit()


@router.post("/routers/{router_id}/voucher-jobs", response_model=VoucherJobCreatedResponse, status_code=status.HTTP_202_ACCEPTED)
def queue_router_vouchers(
    router_id: UUID,
    payload: VoucherBatchCreate,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherJobCreatedResponse:
    check_router_ownership(session, router_id, user.id)
    job = VoucherJob(
        router_id=router_id,
        user_id=user.id,
        payload=payload.model_dump(mode="json"),
        events=[{"time": datetime.utcnow().isoformat(), "stage": "Queued", "message": "Voucher job saved to PostgreSQL"}],
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    background_tasks.add_task(_run_voucher_job, job.id)
    return VoucherJobCreatedResponse(job_id=job.id, status=job.status)


@router.get("/voucher-jobs/{job_id}", response_model=VoucherJobResponse)
def get_voucher_job(
    job_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherJob:
    job = session.exec(
        select(VoucherJob)
        .where(VoucherJob.id == job_id)
        .where(VoucherJob.user_id == user.id)
    ).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher job not found")
    return job


def _router_comment_metadata(comment: str) -> tuple[str, int | None, str | None]:
    phone = "ROUTER-IMPORT"
    package_id = None
    payment_reference = None
    if comment:
        first_token = comment.split()[0]
        if "=" not in first_token:
            phone = normalize_phone(first_token)
        package_match = re.search(r"(?:^|\s)package=(\d+)", comment)
        reference_match = re.search(r"(?:^|\s)ref=([^\s]+)", comment)
        if package_match:
            package_id = int(package_match.group(1))
        if reference_match:
            payment_reference = reference_match.group(1)
    return phone, package_id, payment_reference


def _record_voucher_lifecycle_audit(
    session: Session,
    voucher: VoucherPurchase,
    previous_status: str | None,
    was_activated: bool,
    metadata: dict | None = None,
) -> None:
    if previous_status == voucher.status and was_activated == (voucher.activated_at is not None):
        return
    if not was_activated and voucher.activated_at is not None:
        event = "ACTIVATED"
    elif voucher.status == "EXPIRED":
        event = "EXPIRED"
    elif voucher.status in {"ONLINE", "OFFLINE"}:
        event = f"SESSION_{voucher.status}"
    else:
        event = "STATUS_CHANGED"
    session.add(VoucherActivationAudit(
        voucher_id=voucher.id,
        voucher_code=voucher.voucher_code,
        router_name=voucher.router_name,
        event=event,
        previous_status=previous_status,
        new_status=voucher.status,
        activated_at=voucher.activated_at,
        expires_at=voucher.expires_at,
        metadata_json=metadata,
    ))


def _fetch_router_vouchers_into_database(session: Session, db_router: Router) -> VoucherRouterSyncResponse:
    result = get_hotspot_vouchers(db_router)
    if not result["connected"]:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=result["error"] or "Router is unavailable")
    active_result = get_active_hotspot_users(db_router)
    active_users = {
        str(item.get("user") or item.get("name") or "").strip(): item
        for item in active_result.get("active_users", [])
        if item.get("user") or item.get("name")
    }
    active_codes = set(active_users)

    packages = session.exec(select(RouterPackage).where(RouterPackage.router_id == db_router.id)).all()
    packages_by_profile = {package.profile: package for package in packages}
    profile_devices = {
        str(profile.get("name", "")): str(profile.get("shared-users", "1"))
        for profile in result.get("profiles", [])
    }
    imported = 0
    updated = 0
    router_codes: set[str] = set()

    for item in result["vouchers"]:
        code = str(item.get("name", "")).strip()
        if not code:
            continue
        router_codes.add(code)
        profile = str(item.get("profile", "default"))
        package = packages_by_profile.get(profile)
        phone, comment_package_id, payment_reference = _router_comment_metadata(str(item.get("comment", "")))
        is_online = code in active_codes
        user_uptime = router_uptime_duration(item.get("uptime"))
        active_uptime = router_uptime_duration(active_users.get(code, {}).get("uptime"))
        uptime = user_uptime or active_uptime
        has_router_usage = uptime is not None
        existing = session.exec(select(VoucherPurchase).where(VoucherPurchase.voucher_code == code)).first()
        if existing:
            previous_status = existing.status
            was_activated = existing.activated_at is not None
            existing.profile = profile
            update_voucher_lifecycle(
                existing,
                package_limit=package.limit if package else item.get("limit-uptime"),
                is_online=is_online,
                has_router_usage=has_router_usage,
                router_uptime=uptime,
            )
            _record_voucher_lifecycle_audit(
                session,
                existing,
                previous_status,
                was_activated,
                {"online": is_online, "router_uptime": str(item.get("uptime") or "")},
            )
            session.add(existing)
            updated += 1
            continue

        wallet = get_or_create_wallet(session, db_router.name, phone)
        voucher = VoucherPurchase(
            wallet_id=wallet.id,
            router_name=normalize_router_name(db_router.name),
            phone_number=phone,
            voucher_code=code,
            package_id=comment_package_id or (package.package_id if package else 0),
            profile=profile,
            speed_type=package.speed_type if package else "Router Import",
            amount=int(package.total or 0) if package else 0,
            devices=package.devices if package else profile_devices.get(profile, "1"),
            data=package.data if package else "Imported from MikroTik",
            status="PROVISIONED",
            payment_reference=payment_reference or "ROUTER-IMPORT",
        )
        update_voucher_lifecycle(
            voucher,
            package_limit=package.limit if package else item.get("limit-uptime"),
            is_online=is_online,
            has_router_usage=has_router_usage,
            router_uptime=uptime,
        )
        _record_voucher_lifecycle_audit(
            session,
            voucher,
            None,
            False,
            {"source": "router_import", "online": is_online},
        )
        session.add(voucher)
        imported += 1

    database_vouchers = session.exec(
        select(VoucherPurchase).where(VoucherPurchase.router_name == normalize_router_name(db_router.name))
    ).all()
    for voucher in database_vouchers:
        if voucher.voucher_code not in router_codes and voucher.status in {"ONLINE", "OFFLINE", "ACTIVE", "PROVISIONED"}:
            voucher.status = "ROUTER_MISSING"
            session.add(voucher)
            updated += 1

    session.commit()
    return VoucherRouterSyncResponse(
        success=True,
        router_id=db_router.id,
        router_name=db_router.name,
        imported=imported,
        updated=updated,
    )


@router.post("/routers/{router_id}/vouchers/fetch", response_model=VoucherRouterSyncResponse)
def fetch_router_vouchers_into_database(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherRouterSyncResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    try:
        return _fetch_router_vouchers_into_database(session, db_router)
    except HTTPException as exc:
        session.rollback()
        return VoucherRouterSyncResponse(
            success=False,
            router_id=db_router.id,
            router_name=db_router.name,
            failed=1,
            errors=[str(exc.detail)],
        )
    except Exception as exc:
        session.rollback()
        return VoucherRouterSyncResponse(
            success=False,
            router_id=db_router.id,
            router_name=db_router.name,
            failed=1,
            errors=[str(exc)],
        )


@router.post("/routers/{router_id}/vouchers/sync", response_model=VoucherRouterSyncResponse)
def sync_database_vouchers_to_router(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherRouterSyncResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    router_name = normalize_router_name(db_router.name)
    vouchers = session.exec(
        select(VoucherPurchase).where(VoucherPurchase.router_name == router_name)
    ).all()
    packages = session.exec(select(RouterPackage).where(RouterPackage.router_id == db_router.id)).all()
    packages_by_id = {package.package_id: package for package in packages}
    synced = 0
    failed = 0
    errors: list[str] = []

    for voucher in vouchers:
        if voucher.status == "EXPIRED":
            continue
        package = packages_by_id.get(voucher.package_id)
        package_data = serialize_package(package) if package else {
            "devices": voucher.devices or "1",
            "limit": "",
        }
        try:
            _upsert_hotspot_voucher(db_router, voucher, package_data)
            if voucher.activated_at is None:
                voucher.status = "PROVISIONED"
            synced += 1
        except Exception as exc:
            voucher.status = "ROUTER_SYNC_FAILED"
            failed += 1
            if len(errors) < 10:
                errors.append(f"{voucher.voucher_code}: {exc}")
        session.add(voucher)

    session.commit()
    return VoucherRouterSyncResponse(
        success=failed == 0,
        router_id=db_router.id,
        router_name=db_router.name,
        synced=synced,
        failed=failed,
        errors=errors,
    )


def _delete_router_voucher_codes(router: Router, voucher_codes: list[str]) -> tuple[int, list[str]]:
    return _delete_hotspot_vouchers(router, voucher_codes)


def _mark_expired_router_vouchers(session: Session, router_name: str) -> tuple[int, list[VoucherPurchase]]:
    now = datetime.utcnow()
    activated = session.exec(
        select(VoucherPurchase)
        .where(VoucherPurchase.router_name == router_name)
        .where(VoucherPurchase.activated_at.is_not(None))
    ).all()
    expired = [
        voucher
        for voucher in activated
        if voucher.expires_at is not None and voucher.expires_at <= now
    ]
    for voucher in expired:
        previous_status = voucher.status
        voucher.status = "EXPIRED"
        _record_voucher_lifecycle_audit(
            session,
            voucher,
            previous_status,
            True,
            {"source": "expiry_check"},
        )
        session.add(voucher)
    if expired:
        session.commit()
    return len(activated), expired


@router.post("/routers/{router_id}/vouchers/expired/check", response_model=VoucherExpiryCheckResponse)
def check_expired_router_vouchers(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherExpiryCheckResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    fetch_router_vouchers_into_database(router_id, user, session)
    checked, expired = _mark_expired_router_vouchers(
        session,
        normalize_router_name(db_router.name),
    )
    return VoucherExpiryCheckResponse(
        success=True,
        router_id=db_router.id,
        router_name=db_router.name,
        checked=checked,
        expired=len(expired),
    )


@router.delete("/routers/{router_id}/vouchers/expired", response_model=VoucherDeleteResponse)
def delete_expired_router_vouchers(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherDeleteResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    fetch_router_vouchers_into_database(router_id, user, session)
    _, expired = _mark_expired_router_vouchers(
        session,
        normalize_router_name(db_router.name),
    )
    voucher_codes = [voucher.voucher_code for voucher in expired]
    if not voucher_codes:
        return VoucherDeleteResponse(success=True, deleted=0, router_deleted=0)

    router_deleted, errors = _delete_router_voucher_codes(db_router, voucher_codes)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Failed to delete expired vouchers from router", "errors": errors},
        )

    session.exec(
        sa.delete(VoucherPurchase)
        .where(VoucherPurchase.router_name == normalize_router_name(db_router.name))
        .where(col(VoucherPurchase.voucher_code).in_(voucher_codes))
    )
    session.commit()
    return VoucherDeleteResponse(
        success=True,
        deleted=len(voucher_codes),
        router_deleted=router_deleted,
    )


@router.delete("/routers/{router_id}/vouchers/{voucher_code}", response_model=VoucherDeleteResponse)
def delete_router_voucher(
    router_id: UUID,
    voucher_code: str,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherDeleteResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    voucher = session.exec(
        select(VoucherPurchase)
        .where(VoucherPurchase.router_name == normalize_router_name(db_router.name))
        .where(VoucherPurchase.voucher_code == voucher_code)
    ).first()
    if not voucher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    router_deleted, errors = _delete_router_voucher_codes(db_router, [voucher.voucher_code])
    if errors:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"message": "Failed to delete voucher from router", "errors": errors})

    session.delete(voucher)
    session.commit()
    return VoucherDeleteResponse(success=True, deleted=1, router_deleted=router_deleted)


@router.delete("/routers/{router_id}/voucher-batches/{batch_id}", response_model=VoucherDeleteResponse)
def delete_router_voucher_batch(
    router_id: UUID,
    batch_id: str,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherDeleteResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    router_name = normalize_router_name(db_router.name)
    voucher_codes = list(session.exec(
        select(VoucherPurchase.voucher_code)
        .where(VoucherPurchase.router_name == router_name)
        .where(VoucherPurchase.payment_reference == batch_id)
    ).all())
    if not voucher_codes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher batch not found")

    router_deleted, errors = _delete_router_voucher_codes(db_router, voucher_codes)
    if errors:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"message": "Failed to delete the full batch from router", "errors": errors})

    session.exec(
        sa.delete(VoucherPurchase)
        .where(VoucherPurchase.router_name == router_name)
        .where(VoucherPurchase.payment_reference == batch_id)
    )
    session.commit()
    return VoucherDeleteResponse(success=True, deleted=len(voucher_codes), router_deleted=router_deleted)


@router.get("/branches/{branch_id}/vouchers", response_model=VoucherListResponse)
def list_branch_vouchers(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, max_length=40),
    refresh_router_status: bool = Query(default=False),
) -> VoucherListResponse:
    check_branch_ownership(session, branch_id, user.id)
    routers = branch_routers(session, branch_id)
    router_names = [normalize_router_name(router.name) for router in routers]
    if not router_names:
        return VoucherListResponse(success=True, total=0, vouchers=[])

    if refresh_router_status:
        for db_router in routers:
            try:
                _fetch_router_vouchers_into_database(session, db_router)
            except HTTPException:
                session.rollback()
                continue
            except Exception:
                session.rollback()
                continue

    branch_filter = col(VoucherPurchase.router_name).in_(router_names)
    for router_name in router_names:
        _mark_expired_router_vouchers(session, router_name)

    filters = [branch_filter]
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(sa.or_(
            col(VoucherPurchase.voucher_code).ilike(pattern),
            col(VoucherPurchase.phone_number).ilike(pattern),
            col(VoucherPurchase.payment_reference).ilike(pattern),
        ))
    if status_filter and status_filter != "All":
        status_map = {
            "Active": ["ONLINE", "OFFLINE", "ACTIVE"],
            "Online": ["ONLINE"],
            "Offline": ["OFFLINE"],
            "Unactivated": ["CREATED", "PROVISIONED", "ROUTER_SYNC_FAILED", "ROUTER_MISSING"],
            "Expired": ["EXPIRED"],
        }
        statuses = status_map.get(status_filter)
        if statuses:
            filters.append(col(VoucherPurchase.status).in_(statuses))

    base = select(VoucherPurchase).where(*filters)
    total = session.exec(select(sa.func.count()).select_from(base.subquery())).one()
    vouchers = session.exec(
        base.order_by(col(VoucherPurchase.created_at).desc()).offset(offset).limit(limit)
    ).all()
    return VoucherListResponse(
        success=True,
        total=total,
        vouchers=[serialize_voucher(voucher) for voucher in vouchers],
    )


@router.get("/branches/{branch_id}/voucher-support-summary", response_model=VoucherSupportSummaryResponse)
def branch_voucher_support_summary(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> VoucherSupportSummaryResponse:
    check_branch_ownership(session, branch_id, user.id)
    router_names = branch_router_names(session, branch_id)
    if not router_names:
        return VoucherSupportSummaryResponse(
            success=True,
            total_vouchers=0,
            total_amount=0,
            active_vouchers=0,
            top_customers=[],
            low_customers=[],
            rare_customers=[],
        )

    vouchers = session.exec(
        select(VoucherPurchase)
        .where(col(VoucherPurchase.router_name).in_(router_names))
        .order_by(col(VoucherPurchase.created_at).desc())
    ).all()
    grouped: dict[str, dict[str, object]] = {}
    for voucher in vouchers:
        item = grouped.setdefault(
            voucher.phone_number,
            {"phone_number": voucher.phone_number, "purchases": 0, "total_amount": 0, "last_purchase_at": voucher.created_at},
        )
        item["purchases"] = int(item["purchases"]) + 1
        item["total_amount"] = int(item["total_amount"]) + voucher.amount
        if voucher.created_at > item["last_purchase_at"]:
            item["last_purchase_at"] = voucher.created_at

    insights = [
        VoucherCustomerInsight(
            phone_number=str(item["phone_number"]),
            purchases=int(item["purchases"]),
            total_amount=int(item["total_amount"]),
            last_purchase_at=item["last_purchase_at"],
            segment="Most" if int(item["purchases"]) >= 3 else "Low" if int(item["purchases"]) == 2 else "Rare",
        )
        for item in grouped.values()
    ]
    top_customers = sorted(insights, key=lambda item: (item.purchases, item.total_amount), reverse=True)[:10]
    low_customers = [item for item in sorted(insights, key=lambda item: item.total_amount) if item.purchases == 2][:10]
    rare_customers = [item for item in sorted(insights, key=lambda item: item.last_purchase_at) if item.purchases == 1][:10]

    return VoucherSupportSummaryResponse(
        success=True,
        total_vouchers=len(vouchers),
        total_amount=sum(voucher.amount for voucher in vouchers),
        active_vouchers=len([voucher for voucher in vouchers if voucher.status in {"ONLINE", "OFFLINE", "ACTIVE"}]),
        top_customers=top_customers,
        low_customers=low_customers,
        rare_customers=rare_customers,
    )
