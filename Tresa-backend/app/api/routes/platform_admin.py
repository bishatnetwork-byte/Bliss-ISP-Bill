import secrets
from datetime import datetime, timedelta
from html import escape
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.api.deps import platform_admin, platform_admin_any
from app.services.avatar import get_branch_avatar
from app.core.config import settings
from app.db.session import SessionDep
from app.models.branch import Branch
from app.models.branch_wallet import BranchWallet, BranchWalletTransaction
from app.models.captive_portal import CaptivePortal
from app.models.login_attempt import LoginAttempt
from app.models.notification import Notification
from app.models.platform_admin import PlatformAuditLog, VoucherActivationAudit
from app.models.platform_ledger import PlatformLedgerEntry
from app.models.message import MessageLog
from app.models.portal_ad import PortalAd
from app.models.router import Router
from app.models.router_event import RouterErrorLog
from app.models.telegram_connection import TelegramConnection
from app.models.user import User
from app.models.user_session import UserSession
from app.models.voucher_purchase import VoucherPurchase
from app.schemas.auth import MessageResponse
from app.schemas.platform_admin import (
    PlatformAuditResponse,
    PlatformBranchUpdate,
    PlatformBlockRequest,
    PlatformBroadcastRequest,
    PlatformBroadcastResponse,
    PlatformDnsRecordResponse,
    PlatformDnsRecordCreate,
    PlatformDnsZoneResponse,
    PlatformHealthResponse,
    PlatformLoginAttemptResponse,
    PlatformMessageDiagnosticResponse,
    PlatformNotificationResponse,
    PlatformOverviewResponse,
    PlatformPasswordResetResponse,
    PlatformSessionResponse,
    PlatformSettingsResponse,
    PlatformSettingsUpdate,
    PlatformStorageObjectResponse,
    PlatformSubadminUpdate,
    PlatformTunnelResponse,
    PlatformUserBranchResponse,
    PlatformUserCreate,
    PlatformUserCreateResponse,
    PlatformUserDetailResponse,
    PlatformUserResponse,
    PlatformUserRouterResponse,
    PlatformUserUpdate,
    PlatformUserVoucherResponse,
    PlatformVoucherAuditResponse,
    PlatformWalletResponse,
    PlatformLedgerEntryFullResponse,
    PlatformAllTransactionResponse,
)
from app.schemas.ads import PortalAdCreate, PortalAdResponse, PortalAdUpdate
from app.schemas.portal import CaptivePortalPushRequest, PushCaptiveResponse
from app.schemas.router import RouterCredentialsUpdate
from app.services.ads import (
    create_router_ad,
    get_ad_metrics,
    get_router_ads,
    serialize_portal_ad,
    update_router_ad,
)
from app.services.dns_provider import (
    DnsProviderError,
    create_record,
    delete_record,
    is_configured as dns_is_configured,
    list_records,
    list_zones,
    provider_name as dns_provider_name,
)
from app.services.email import send_email
from app.services.messaging import normalize_sms_phone, send_sms
from app.services.platform_admin import (
    ADMIN_PERMISSIONS,
    USER_SECTIONS,
    audit,
    permissions_for,
    set_settings,
    settings_snapshot,
)
from app.services.portal import normalize_router_name, push_captive_files_to_mikrotik
from app.services.routers.credentials import encrypt_secret
from app.services.security import hash_password, normalize_email
from app.services.storage import STORAGE_ERRORS, delete_object, list_objects
from app.services.wallet import freeze_wallet

router = APIRouter(prefix="/platform-admin", tags=["Platform Admin"])

RESERVED_SUBDOMAINS = {
    "admin", "api", "app", "auth", "billing", "dashboard", "help", "login",
    "mail", "platform", "portal", "signup", "status", "support", "www",
}


def _admin(permission: str):
    return Depends(platform_admin(permission))


def _account_dns_context() -> tuple[str, str, list[dict]]:
    zones = list_zones()
    zone = next(
        (item for item in zones if str(item.get("name", "")).rstrip(".").lower() == settings.account_base_domain),
        None,
    )
    if not zone:
        raise DnsProviderError(f"DNS zone {settings.account_base_domain} is not available")
    return str(zone["id"]), settings.renult_app_url.split("://", 1)[-1].split("/", 1)[0], list_records(str(zone["id"]))


def _provision_account_subdomain(subdomain: str) -> None:
    zone_id, target, records = _account_dns_context()
    hostname = f"{subdomain}.{settings.account_base_domain}"
    existing = next(
        (record for record in records if str(record.get("name", "")).rstrip(".").lower() == hostname),
        None,
    )
    if existing:
        if str(existing.get("type", "")).upper() == "CNAME" and str(existing.get("content", "")).rstrip(".").lower() == target.lower():
            return
        raise DnsProviderError(f"DNS record {hostname} already exists with different settings")
    create_record(zone_id, {
        "name": hostname,
        "type": "CNAME",
        "content": target,
        "ttl": 600,
        "disabled": False,
        "proxied": False,
    })


def _remove_account_subdomain(subdomain: str) -> None:
    zone_id, _, records = _account_dns_context()
    hostname = f"{subdomain}.{settings.account_base_domain}"
    existing = next(
        (record for record in records if str(record.get("name", "")).rstrip(".").lower() == hostname),
        None,
    )
    if existing:
        delete_record(zone_id, str(existing["id"]))


def _user_response(session: Session, user: User) -> PlatformUserResponse:
    branch_ids = list(session.exec(select(Branch.id).where(Branch.user_id == user.id)).all())
    router_count = 0
    voucher_count = 0
    wallet_balance = 0
    if branch_ids:
        router_count = int(session.exec(
            select(func.count(Router.id)).where(col(Router.branch_id).in_(branch_ids))
        ).one())
        router_names = [
            name.strip().upper()
            for name in session.exec(select(Router.name).where(col(Router.branch_id).in_(branch_ids))).all()
        ]
        if router_names:
            voucher_count = int(session.exec(
                select(func.count(VoucherPurchase.id))
                .where(col(VoucherPurchase.router_name).in_(router_names))
            ).one())
        wallet_balance = int(session.exec(
            select(func.coalesce(func.sum(BranchWallet.balance), 0))
            .where(col(BranchWallet.branch_id).in_(branch_ids))
        ).one())
    return PlatformUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone_number=user.phone_number,
        is_verified=user.is_verified,
        is_active=user.is_active,
        allowed_sections=[item for item in (user.allowed_sections or "").split(",") if item],
        platform_role=user.platform_role,
        platform_permissions=sorted(permissions_for(user)),
        account_subdomain=user.account_subdomain,
        subdomain_enabled=user.subdomain_enabled,
        branches=len(branch_ids),
        routers=router_count,
        vouchers=voucher_count,
        wallet_balance=wallet_balance,
        created_at=user.created_at,
        blocked_until=user.blocked_until,
        force_password_change=user.force_password_change,
    )


@router.get("/overview", response_model=PlatformOverviewResponse)
def overview(
    session: SessionDep,
    admin: User = _admin("overview"),
) -> PlatformOverviewResponse:
    del admin
    users = int(session.exec(select(func.count(User.id))).one())
    active_users = int(session.exec(select(func.count(User.id)).where(User.is_active.is_(True))).one())
    branches = int(session.exec(select(func.count(Branch.id))).one())
    routers = int(session.exec(select(func.count(Router.id))).one())
    tunnels_online = int(session.exec(
        select(func.count(Router.id)).where(Router.status.in_(["connected", "online"]))
    ).one())
    vouchers = int(session.exec(select(func.count(VoucherPurchase.id))).one())
    activated_vouchers = int(session.exec(
        select(func.count(VoucherPurchase.id)).where(VoucherPurchase.activated_at.is_not(None))
    ).one())
    expired_vouchers = int(session.exec(
        select(func.count(VoucherPurchase.id)).where(VoucherPurchase.status == "EXPIRED")
    ).one())
    return PlatformOverviewResponse(
        users=users,
        active_users=active_users,
        branches=branches,
        routers=routers,
        tunnels_online=tunnels_online,
        tunnels_offline=routers - tunnels_online,
        vouchers=vouchers,
        activated_vouchers=activated_vouchers,
        expired_vouchers=expired_vouchers,
        wallet_balance=int(session.exec(select(func.coalesce(func.sum(BranchWallet.balance), 0))).one()),
        platform_fees=int(session.exec(select(func.coalesce(func.sum(PlatformLedgerEntry.amount), 0))).one()),
        r2_configured=bool(settings.r2_account_id and settings.r2_bucket_name),
        dns_configured=dns_is_configured(),
        dns_provider=dns_provider_name(),
        telegram_admins=int(session.exec(
            select(func.count(TelegramConnection.id))
            .join(User, TelegramConnection.user_id == User.id)
            .where(User.platform_role.in_(["superadmin", "subadmin"]))
        ).one()),
    )


@router.get("/users", response_model=list[PlatformUserResponse])
def users(
    session: SessionDep,
    admin: User = Depends(platform_admin_any("users", "subadmins", "broadcasts")),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[PlatformUserResponse]:
    del admin
    branch_count = (
        select(func.count(Branch.id))
        .where(Branch.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    router_count = (
        select(func.count(Router.id))
        .join(Branch, Router.branch_id == Branch.id)
        .where(Branch.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    voucher_count = (
        select(func.count(func.distinct(VoucherPurchase.id)))
        .select_from(VoucherPurchase)
        .join(Router, func.upper(Router.name) == VoucherPurchase.router_name)
        .join(Branch, Router.branch_id == Branch.id)
        .where(Branch.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    wallet_balance = (
        select(func.coalesce(func.sum(BranchWallet.balance), 0))
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .where(Branch.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    query = select(User, branch_count, router_count, voucher_count, wallet_balance)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(sa.or_(
            col(User.full_name).ilike(pattern),
            col(User.email).ilike(pattern),
            col(User.phone_number).ilike(pattern),
        ))
    rows = session.exec(query.order_by(User.created_at.desc()).limit(limit)).all()
    return [
        PlatformUserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone_number=user.phone_number,
            is_verified=user.is_verified,
            is_active=user.is_active,
            allowed_sections=[item for item in (user.allowed_sections or "").split(",") if item],
            platform_role=user.platform_role,
            platform_permissions=sorted(permissions_for(user)),
            account_subdomain=user.account_subdomain,
            subdomain_enabled=user.subdomain_enabled,
            branches=int(branches),
            routers=int(routers),
            vouchers=int(vouchers),
            wallet_balance=int(balance),
            created_at=user.created_at,
            blocked_until=user.blocked_until,
            force_password_change=user.force_password_change,
        )
        for user, branches, routers, vouchers, balance in rows
    ]


@router.put("/users/{user_id}", response_model=PlatformUserResponse)
@router.patch("/users/{user_id}", response_model=PlatformUserResponse)
def update_user(
    user_id: UUID,
    payload: PlatformUserUpdate,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PlatformUserResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == admin.id and payload.is_active is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot suspend your own account")
    if payload.email is not None:
        email = normalize_email(str(payload.email))
        existing = session.exec(
            select(User).where(func.lower(User.email) == email).where(User.id != target.id)
        ).first()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "A user with that email already exists")
        target.email = email
    if payload.full_name is not None:
        full_name = payload.full_name.strip()
        if not full_name:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Full name cannot be blank")
        target.full_name = full_name
    if "phone_number" in payload.model_fields_set:
        target.phone_number = (payload.phone_number or "").strip() or None
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.is_verified is not None:
        target.is_verified = payload.is_verified
    if payload.allowed_sections is not None:
        invalid = set(payload.allowed_sections) - USER_SECTIONS
        if invalid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported sections: {', '.join(sorted(invalid))}")
        target.allowed_sections = ",".join(sorted(set(payload.allowed_sections))) or None
    if "account_subdomain" in payload.model_fields_set:
        subdomain = (payload.account_subdomain or "").strip().lower() or None
        previous_subdomain = target.account_subdomain
        if subdomain in RESERVED_SUBDOMAINS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That subdomain is reserved")
        if subdomain:
            existing = session.exec(
                select(User)
                .where(func.lower(User.account_subdomain) == subdomain)
                .where(User.id != target.id)
            ).first()
            if existing:
                raise HTTPException(status.HTTP_409_CONFLICT, "That subdomain is already assigned")
        try:
            if subdomain:
                _provision_account_subdomain(subdomain)
            if previous_subdomain and previous_subdomain != subdomain:
                _remove_account_subdomain(previous_subdomain)
        except DnsProviderError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not provision account DNS: {exc}")
        target.account_subdomain = subdomain
        if not subdomain:
            target.subdomain_enabled = False
    if payload.subdomain_enabled is not None:
        if payload.subdomain_enabled and not target.account_subdomain:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assign a subdomain before enabling access")
        target.subdomain_enabled = payload.subdomain_enabled
    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    session.refresh(target)
    audit(session, admin, "user_updated", "user", str(target.id), payload.model_dump(exclude_unset=True))
    return _user_response(session, target)


@router.post("/users/{user_id}/subdomain/sync", response_model=MessageResponse)
def sync_user_subdomain(
    user_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> MessageResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not target.account_subdomain:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assign a subdomain first")
    try:
        _provision_account_subdomain(target.account_subdomain)
    except DnsProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not provision account DNS: {exc}")
    audit(
        session,
        admin,
        "user_subdomain_synced",
        "user",
        str(target.id),
        {"subdomain": target.account_subdomain},
    )
    return MessageResponse(
        message=f"{target.account_subdomain}.{settings.account_base_domain} is configured"
    )


@router.get("/users/{user_id}", response_model=PlatformUserDetailResponse)
def user_detail(
    user_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PlatformUserDetailResponse:
    del admin
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    branches = session.exec(
        select(Branch).where(Branch.user_id == target.id).order_by(Branch.created_at.desc())
    ).all()
    branch_ids = [branch.id for branch in branches]
    routers = session.exec(
        select(Router, Branch)
        .join(Branch, Router.branch_id == Branch.id)
        .where(Branch.user_id == target.id)
        .order_by(Router.created_at.desc())
    ).all()
    router_names = {router.name.strip().upper() for router, _ in routers}
    vouchers = session.exec(
        select(VoucherPurchase)
        .where(col(VoucherPurchase.router_name).in_(router_names))
        .order_by(VoucherPurchase.created_at.desc())
        .limit(100)
    ).all() if router_names else []
    wallets = session.exec(
        select(BranchWallet).where(col(BranchWallet.branch_id).in_(branch_ids))
    ).all() if branch_ids else []

    routers_by_branch: dict[UUID, list[Router]] = {}
    for router_row, _ in routers:
        routers_by_branch.setdefault(router_row.branch_id, []).append(router_row)
    wallet_by_branch = {wallet.branch_id: wallet for wallet in wallets}
    voucher_count_by_router: dict[str, int] = {}
    if router_names:
        voucher_counts = session.exec(
            select(VoucherPurchase.router_name, func.count(VoucherPurchase.id))
            .where(col(VoucherPurchase.router_name).in_(router_names))
            .group_by(VoucherPurchase.router_name)
        ).all()
        voucher_count_by_router = {name: int(count) for name, count in voucher_counts}

    return PlatformUserDetailResponse(
        user=_user_response(session, target),
        branches=[
            PlatformUserBranchResponse(
                id=branch.id,
                name=branch.name,
                avatar_url=branch.avatar_url,
                routers=len(routers_by_branch.get(branch.id, [])),
                vouchers=sum(
                    voucher_count_by_router.get(router.name.strip().upper(), 0)
                    for router in routers_by_branch.get(branch.id, [])
                ),
                wallet_balance=wallet_by_branch.get(branch.id).balance if branch.id in wallet_by_branch else 0,
                wallet_frozen=wallet_by_branch.get(branch.id).is_frozen if branch.id in wallet_by_branch else False,
                created_at=branch.created_at,
            )
            for branch in branches
        ],
        routers=[
            PlatformUserRouterResponse(
                id=router_row.id,
                branch_id=branch.id,
                branch_name=branch.name,
                name=router_row.name,
                location=router_row.location,
                is_active=router_row.is_active,
                status=router_row.status,
                last_seen=router_row.last_seen,
                created_at=router_row.created_at,
            )
            for router_row, branch in routers
        ],
        recent_vouchers=[
            PlatformUserVoucherResponse(
                id=voucher.id,
                voucher_code=voucher.voucher_code,
                router_name=voucher.router_name,
                phone_number=voucher.phone_number,
                profile=voucher.profile,
                amount=voucher.amount,
                status=voucher.status,
                created_at=voucher.created_at,
                activated_at=voucher.activated_at,
                expires_at=voucher.expires_at,
            )
            for voucher in vouchers
        ],
    )


@router.put("/users/{user_id}/branches/{branch_id}", response_model=MessageResponse)
@router.patch("/users/{user_id}/branches/{branch_id}", response_model=MessageResponse)
def update_user_branch(
    user_id: UUID,
    branch_id: UUID,
    payload: PlatformBranchUpdate,
    session: SessionDep,
    admin: User = _admin("users"),
) -> MessageResponse:
    branch = session.exec(
        select(Branch)
        .where(Branch.id == branch_id)
        .where(Branch.user_id == user_id)
    ).first()
    if not branch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found for this user")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Branch name cannot be blank")
    previous_name = branch.name
    branch.name = name
    branch.avatar_url = get_branch_avatar(name)
    branch.updated_at = datetime.utcnow()
    session.add(branch)
    session.commit()
    audit(session, admin, "user_branch_updated", "branch", str(branch.id), {
        "user_id": str(user_id),
        "previous_name": previous_name,
        "name": name,
    })
    return MessageResponse(message="Branch name updated")


@router.post("/users", response_model=PlatformUserCreateResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: PlatformUserCreate,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PlatformUserCreateResponse:
    email = normalize_email(str(payload.email))
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered")

    temp_password = payload.password or secrets.token_urlsafe(9)
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        phone_number=(payload.phone_number or "").strip() or None,
        password_hash=hash_password(temp_password),
        is_verified=True,
        force_password_change=payload.password is None,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    branch_name = f"{user.full_name} Branch"
    session.add(Branch(name=branch_name, avatar_url=get_branch_avatar(branch_name), user_id=user.id))
    session.commit()

    audit(session, admin, "user_created", "user", str(user.id), {"email": email})
    return PlatformUserCreateResponse(
        user=_user_response(session, user),
        temp_password=temp_password if payload.password is None else None,
    )


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> MessageResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove your own account")
    branch_count = session.exec(select(func.count(Branch.id)).where(Branch.user_id == target.id)).one()
    if int(branch_count) > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This user still owns branches/routers suspend or transfer them before removal",
        )
    email = target.email
    session.delete(target)
    session.commit()
    audit(session, admin, "user_deleted", "user", str(user_id), {"email": email})
    return MessageResponse(message="User removed.")


@router.post("/users/{user_id}/block", response_model=PlatformUserResponse)
def block_user(
    user_id: UUID,
    payload: PlatformBlockRequest,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PlatformUserResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot block your own account")
    if payload.permanent:
        target.is_active = False
        target.blocked_until = None
    else:
        target.blocked_until = payload.blocked_until
    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    session.refresh(target)
    audit(session, admin, "user_blocked", "user", str(target.id), payload.model_dump(mode="json"))
    return _user_response(session, target)


@router.post("/users/{user_id}/unblock", response_model=PlatformUserResponse)
def unblock_user(
    user_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PlatformUserResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    target.blocked_until = None
    target.is_active = True
    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    session.refresh(target)
    audit(session, admin, "user_unblocked", "user", str(target.id))
    return _user_response(session, target)


@router.post("/users/{user_id}/reset-password", response_model=PlatformPasswordResetResponse)
def reset_user_password(
    user_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PlatformPasswordResetResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    temp_password = secrets.token_urlsafe(9)
    target.password_hash = hash_password(temp_password)
    target.force_password_change = True
    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    audit(session, admin, "user_password_reset", "user", str(target.id))
    return PlatformPasswordResetResponse(user_id=target.id, temp_password=temp_password)


@router.get("/login-attempts", response_model=list[PlatformLoginAttemptResponse])
def login_attempts(
    session: SessionDep,
    admin: User = _admin("sessions"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformLoginAttemptResponse]:
    del admin
    rows = session.exec(
        select(LoginAttempt, User.full_name)
        .join(User, LoginAttempt.user_id == User.id, isouter=True)
        .order_by(LoginAttempt.created_at.desc())
        .limit(limit)
    ).all()
    return [
        PlatformLoginAttemptResponse(
            id=attempt.id,
            email=attempt.email,
            user_id=attempt.user_id,
            user_name=name,
            success=attempt.success,
            ip_address=attempt.ip_address,
            user_agent=attempt.user_agent,
            failure_reason=attempt.failure_reason,
            created_at=attempt.created_at,
        )
        for attempt, name in rows
    ]


@router.get("/sessions", response_model=list[PlatformSessionResponse])
def list_sessions(
    session: SessionDep,
    admin: User = _admin("sessions"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformSessionResponse]:
    del admin
    rows = session.exec(
        select(UserSession, User.full_name)
        .join(User, UserSession.user_id == User.id)
        .where(col(UserSession.revoked_at).is_(None))
        .order_by(UserSession.last_seen_at.desc())
        .limit(limit)
    ).all()
    return [
        PlatformSessionResponse(
            id=row.id,
            user_id=row.user_id,
            user_name=name,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            revoked_at=row.revoked_at,
        )
        for row, name in rows
    ]


@router.post("/sessions/{session_id}/revoke", response_model=MessageResponse)
def revoke_session(
    session_id: UUID,
    session: SessionDep,
    admin: User = _admin("sessions"),
) -> MessageResponse:
    target = session.get(UserSession, session_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    target.revoked_at = datetime.utcnow()
    session.add(target)
    session.commit()
    audit(session, admin, "session_revoked", "user_session", str(session_id), {"user_id": str(target.user_id)})
    return MessageResponse(message="Session revoked.")


@router.get("/notifications", response_model=list[PlatformNotificationResponse])
def list_notifications(
    session: SessionDep,
    admin: User = _admin("notifications"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformNotificationResponse]:
    del admin
    rows = session.exec(
        select(Notification, User.full_name)
        .join(User, Notification.user_id == User.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    ).all()
    return [
        PlatformNotificationResponse(
            id=row.id,
            user_id=row.user_id,
            user_name=name,
            category=row.category,
            title=row.title,
            body=row.body,
            is_read=row.is_read,
            created_at=row.created_at,
        )
        for row, name in rows
    ]


@router.delete("/notifications/{notification_id}", response_model=MessageResponse)
def delete_notification(
    notification_id: UUID,
    session: SessionDep,
    admin: User = _admin("notifications"),
) -> MessageResponse:
    target = session.get(Notification, notification_id)
    if target:
        session.delete(target)
        session.commit()
    audit(session, admin, "notification_cleared", "notification", str(notification_id))
    return MessageResponse(message="Notification cleared.")


@router.delete("/notifications", response_model=MessageResponse)
def clear_notifications(
    session: SessionDep,
    admin: User = _admin("notifications"),
) -> MessageResponse:
    count = session.exec(select(func.count(Notification.id))).one()
    session.exec(sa.delete(Notification))
    session.commit()
    audit(session, admin, "notifications_cleared", "notification", None, {"count": int(count)})
    return MessageResponse(message=f"Cleared {int(count)} notifications.")


@router.delete("/message-diagnostics/{message_id}", response_model=MessageResponse)
def delete_message_diagnostic(
    message_id: UUID,
    session: SessionDep,
    admin: User = _admin("message_diagnostics"),
) -> MessageResponse:
    target = session.get(MessageLog, message_id)
    if target:
        session.delete(target)
        session.commit()
    audit(session, admin, "message_log_cleared", "message_log", str(message_id))
    return MessageResponse(message="Message log entry cleared.")


@router.delete("/message-diagnostics", response_model=MessageResponse)
def clear_message_diagnostics(
    session: SessionDep,
    admin: User = _admin("message_diagnostics"),
) -> MessageResponse:
    count = session.exec(select(func.count(MessageLog.id))).one()
    session.exec(sa.delete(MessageLog))
    session.commit()
    audit(session, admin, "message_logs_cleared", "message_log", None, {"count": int(count)})
    return MessageResponse(message=f"Cleared {int(count)} message log entries.")


@router.put("/subadmins/{user_id}", response_model=PlatformUserResponse)
def update_subadmin(
    user_id: UUID,
    payload: PlatformSubadminUpdate,
    session: SessionDep,
    admin: User = _admin("subadmins"),
) -> PlatformUserResponse:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.platform_role == "superadmin" and target.id != admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A superadmin cannot be changed here")
    invalid = set(payload.permissions) - ADMIN_PERMISSIONS
    if invalid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported permissions: {', '.join(sorted(invalid))}")
    target.platform_role = None if payload.role == "none" else "subadmin"
    target.platform_permissions = None if payload.role == "none" else ",".join(sorted(set(payload.permissions)))
    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    session.refresh(target)
    audit(session, admin, "subadmin_updated", "user", str(target.id), payload.model_dump())
    return _user_response(session, target)


@router.get("/settings", response_model=PlatformSettingsResponse)
def get_settings(
    session: SessionDep,
    admin: User = _admin("finance"),
) -> PlatformSettingsResponse:
    del admin
    return PlatformSettingsResponse(**settings_snapshot(session))


@router.put("/settings", response_model=PlatformSettingsResponse)
def update_settings(
    payload: PlatformSettingsUpdate,
    session: SessionDep,
    admin: User = _admin("finance"),
) -> PlatformSettingsResponse:
    values = set_settings(session, payload.model_dump(), admin.id)
    audit(session, admin, "platform_settings_updated", "platform_settings", details=payload.model_dump())
    return PlatformSettingsResponse(**values)


@router.get("/wallets", response_model=list[PlatformWalletResponse])
def wallets(
    session: SessionDep,
    admin: User = _admin("finance"),
) -> list[PlatformWalletResponse]:
    del admin
    rows = session.exec(
        select(BranchWallet, Branch, User)
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .join(User, Branch.user_id == User.id)
        .order_by(BranchWallet.updated_at.desc())
    ).all()
    return [
        PlatformWalletResponse(
            id=wallet.id,
            user_id=user.id,
            owner_name=user.full_name,
            branch_id=branch.id,
            branch_name=branch.name,
            balance=wallet.balance,
            total_deposited=wallet.total_deposited,
            total_withdrawn=wallet.total_withdrawn,
            total_fees_paid=wallet.total_fees_paid,
            is_frozen=wallet.is_frozen,
            updated_at=wallet.updated_at,
        )
        for wallet, branch, user in rows
    ]


@router.get("/ledger", response_model=list[PlatformLedgerEntryFullResponse])
def platform_ledger(
    session: SessionDep,
    limit: int = Query(default=200, ge=1, le=500),
    admin: User = _admin("finance"),
) -> list[PlatformLedgerEntryFullResponse]:
    """All platform fee ledger entries (DEPOSIT_FEE, WITHDRAWAL_FEE) with owner info."""
    del admin
    rows = session.exec(
        select(PlatformLedgerEntry, Branch, User)
        .join(Branch, PlatformLedgerEntry.branch_id == Branch.id)
        .join(User, Branch.user_id == User.id)
        .order_by(PlatformLedgerEntry.created_at.desc())
        .limit(limit)
    ).all()
    return [
        PlatformLedgerEntryFullResponse(
            id=entry.id,
            branch_id=entry.branch_id,
            branch_name=branch.name,
            user_id=entry.user_id,
            owner_name=user.full_name,
            amount=entry.amount,
            fee_type=entry.fee_type,
            source_amount=entry.source_amount,
            fee_rate=entry.fee_rate,
            reference=entry.reference,
            created_at=entry.created_at,
        )
        for entry, branch, user in rows
    ]


@router.get("/all-transactions", response_model=list[PlatformAllTransactionResponse])
def all_transactions(
    session: SessionDep,
    limit: int = Query(default=200, ge=1, le=500),
    admin: User = _admin("finance"),
) -> list[PlatformAllTransactionResponse]:
    """All branch wallet transactions across every client, newest first."""
    del admin
    rows = session.exec(
        select(BranchWalletTransaction, Branch, User)
        .join(BranchWallet, BranchWalletTransaction.wallet_id == BranchWallet.id)
        .join(Branch, BranchWallet.branch_id == Branch.id)
        .join(User, Branch.user_id == User.id)
        .order_by(BranchWalletTransaction.created_at.desc())
        .limit(limit)
    ).all()
    return [
        PlatformAllTransactionResponse(
            id=txn.id,
            wallet_id=txn.wallet_id,
            branch_id=txn.branch_id,
            branch_name=branch.name,
            owner_name=user.full_name,
            amount=txn.amount,
            fee_amount=txn.fee_amount,
            net_amount=txn.net_amount,
            transaction_type=txn.transaction_type.lower(),
            reference=txn.reference,
            status=txn.status,
            recipient_phone=txn.recipient_phone,
            gateway_status=txn.gateway_status,
            failure_reason=txn.failure_reason,
            created_at=txn.created_at,
        )
        for txn, branch, user in rows
    ]


@router.get("/tunnels", response_model=list[PlatformTunnelResponse])
def tunnels(
    session: SessionDep,
    admin: User = _admin("tunnels"),
) -> list[PlatformTunnelResponse]:
    del admin
    rows = session.exec(
        select(Router, Branch, User)
        .join(Branch, Router.branch_id == Branch.id)
        .join(User, Branch.user_id == User.id)
        .order_by(Router.updated_at.desc())
    ).all()
    return [
        PlatformTunnelResponse(
            id=router.id,
            router_name=router.name,
            owner_name=user.full_name,
            branch_name=branch.name,
            is_active=router.is_active,
            status=router.status,
            heartbeat_status=router.heartbeat_status,
            snmp_status=router.snmp_status,
            tunnel_ip=router.tunnel_ip,
            ppp_username=router.ppp_username,
            nat_port=router.nat_port,
            winbox_nat_port=router.winbox_nat_port,
            connected_at=router.connected_at,
            disconnected_at=router.disconnected_at,
            last_seen=router.last_seen,
        )
        for router, branch, user in rows
    ]


@router.post("/tunnels/{router_id}/active", response_model=MessageResponse)
def set_tunnel_active(
    router_id: UUID,
    active: bool,
    session: SessionDep,
    admin: User = _admin("tunnels"),
) -> MessageResponse:
    target = session.get(Router, router_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Router not found")
    target.is_active = active
    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    audit(session, admin, "router_activation_changed", "router", str(target.id), {"active": active})
    return MessageResponse(message=f"{target.name} {'enabled' if active else 'disabled'}")


def _admin_get_router(session: SessionDep, router_id: UUID) -> Router:
    db_router = session.get(Router, router_id)
    if not db_router:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Router not found")
    return db_router


@router.get("/routers/{router_id}/ads", response_model=list[PortalAdResponse])
def admin_list_router_ads(
    router_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> list[PortalAdResponse]:
    del admin
    db_router = _admin_get_router(session, router_id)
    ads = get_router_ads(session, db_router.id)
    metrics = get_ad_metrics(session, [ad.id for ad in ads])
    return [PortalAdResponse(**serialize_portal_ad(ad, metrics.get(ad.id))) for ad in ads]


@router.post("/routers/{router_id}/ads", response_model=PortalAdResponse, status_code=status.HTTP_201_CREATED)
def admin_create_router_ad(
    router_id: UUID,
    payload: PortalAdCreate,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PortalAdResponse:
    db_router = _admin_get_router(session, router_id)
    ad = create_router_ad(session, db_router.id, payload)
    audit(session, admin, "ad_pushed", "router", str(db_router.id), {"ad_id": str(ad.id), "advertiser_name": ad.advertiser_name})
    return PortalAdResponse(**serialize_portal_ad(ad))


@router.put("/routers/{router_id}/ads/{ad_id}", response_model=PortalAdResponse)
def admin_update_router_ad(
    router_id: UUID,
    ad_id: UUID,
    payload: PortalAdUpdate,
    session: SessionDep,
    admin: User = _admin("users"),
) -> PortalAdResponse:
    _admin_get_router(session, router_id)
    existing = session.get(PortalAd, ad_id)
    if not existing or existing.router_id != router_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = update_router_ad(session, existing, payload)
    metrics = get_ad_metrics(session, [ad.id])
    audit(session, admin, "ad_updated", "router", str(router_id), {"ad_id": str(ad.id)})
    return PortalAdResponse(**serialize_portal_ad(ad, metrics.get(ad.id)))


@router.delete("/routers/{router_id}/ads/{ad_id}", response_model=MessageResponse)
def admin_delete_router_ad(
    router_id: UUID,
    ad_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
) -> MessageResponse:
    existing = session.get(PortalAd, ad_id)
    if not existing or existing.router_id != router_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    session.delete(existing)
    session.commit()
    audit(session, admin, "ad_removed", "router", str(router_id), {"ad_id": str(ad_id)})
    return MessageResponse(message="Ad removed.")


@router.post("/routers/{router_id}/captive/push", response_model=PushCaptiveResponse)
def admin_push_router_captive(
    router_id: UUID,
    session: SessionDep,
    admin: User = _admin("users"),
    payload: CaptivePortalPushRequest | None = None,
) -> PushCaptiveResponse:
    db_router = _admin_get_router(session, router_id)
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
    audit(session, admin, "captive_portal_pushed", "router", str(db_router.id), {"template": template, "success": result["success"]})
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


@router.post("/routers/{router_id}/credentials", response_model=MessageResponse)
def admin_set_router_credentials(
    router_id: UUID,
    payload: RouterCredentialsUpdate,
    session: SessionDep,
    admin: User = _admin("users"),
) -> MessageResponse:
    db_router = _admin_get_router(session, router_id)
    db_router.username = payload.username.strip()
    db_router.password = encrypt_secret(payload.password)
    db_router.updated_at = datetime.utcnow()
    session.add(db_router)
    session.commit()
    audit(session, admin, "router_credentials_reset", "router", str(db_router.id), {"username": payload.username})
    return MessageResponse(message=f"Mikrotik login updated for {db_router.name}.")


@router.get("/voucher-audit", response_model=list[PlatformVoucherAuditResponse])
def voucher_audit(
    session: SessionDep,
    admin: User = _admin("voucher_audit"),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformVoucherAuditResponse]:
    del admin
    query = select(VoucherActivationAudit)
    voucher_query = select(VoucherPurchase)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(sa.or_(
            col(VoucherActivationAudit.voucher_code).ilike(pattern),
            col(VoucherActivationAudit.router_name).ilike(pattern),
            col(VoucherActivationAudit.event).ilike(pattern),
            col(VoucherActivationAudit.new_status).ilike(pattern),
        ))
        voucher_query = voucher_query.where(sa.or_(
            col(VoucherPurchase.voucher_code).ilike(pattern),
            col(VoucherPurchase.router_name).ilike(pattern),
            col(VoucherPurchase.status).ilike(pattern),
            col(VoucherPurchase.phone_number).ilike(pattern),
        ))
    audit_rows = session.exec(
        query.order_by(VoucherActivationAudit.created_at.desc()).limit(limit)
    ).all()
    audited_voucher_ids = {row.voucher_id for row in audit_rows if row.voucher_id}
    voucher_rows = session.exec(
        voucher_query.order_by(VoucherPurchase.created_at.desc()).limit(limit)
    ).all()
    results = [
        PlatformVoucherAuditResponse(
            id=row.id,
            voucher_code=row.voucher_code,
            router_name=row.router_name,
            event=row.event,
            previous_status=row.previous_status,
            new_status=row.new_status,
            activated_at=row.activated_at,
            expires_at=row.expires_at,
            metadata=row.metadata_json,
            created_at=row.created_at,
        )
        for row in audit_rows
    ]
    results.extend(
        PlatformVoucherAuditResponse(
            id=row.id,
            voucher_code=row.voucher_code,
            router_name=row.router_name,
            event="current_record",
            previous_status=None,
            new_status=row.status,
            activated_at=row.activated_at,
            expires_at=row.expires_at,
            metadata={
                "phone_number": row.phone_number,
                "profile": row.profile,
                "amount": row.amount,
                "payment_reference": row.payment_reference,
            },
            created_at=row.created_at,
        )
        for row in voucher_rows
        if row.id not in audited_voucher_ids
    )
    return sorted(results, key=lambda row: row.created_at, reverse=True)[:limit]


@router.get("/message-diagnostics", response_model=list[PlatformMessageDiagnosticResponse])
def message_diagnostics(
    session: SessionDep,
    admin: User = _admin("message_diagnostics"),
    search: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, max_length=20),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformMessageDiagnosticResponse]:
    del admin
    query = (
        select(MessageLog, Branch, User)
        .join(Branch, MessageLog.branch_id == Branch.id)
        .join(User, MessageLog.user_id == User.id)
    )
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(sa.or_(
            col(Branch.name).ilike(pattern),
            col(User.full_name).ilike(pattern),
            col(User.email).ilike(pattern),
            col(MessageLog.message).ilike(pattern),
            col(MessageLog.error).ilike(pattern),
        ))
    if status_filter and status_filter != "all":
        query = query.where(MessageLog.status == status_filter)
    rows = session.exec(
        query.order_by(MessageLog.created_at.desc()).limit(limit)
    ).all()
    return [
        PlatformMessageDiagnosticResponse(
            id=entry.id,
            branch_id=branch.id,
            branch_name=branch.name,
            user_id=sender.id,
            user_name=sender.full_name,
            message=entry.message,
            message_type=entry.message_type,
            recipients=list(entry.recipients or []),
            status=entry.status,
            sent=entry.sent,
            failed=entry.failed,
            results=entry.results,
            error=entry.error,
            cost_per_sms=entry.cost_per_sms,
            total_charged=entry.total_charged,
            wallet_balance=entry.wallet_balance,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )
        for entry, branch, sender in rows
    ]


@router.get("/audit", response_model=list[PlatformAuditResponse])
def audit_log(
    session: SessionDep,
    admin: User = _admin("audit"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformAuditResponse]:
    del admin
    rows = session.exec(
        select(PlatformAuditLog, User)
        .join(User, PlatformAuditLog.actor_id == User.id, isouter=True)
        .order_by(PlatformAuditLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        PlatformAuditResponse(
            id=entry.id,
            actor_id=entry.actor_id,
            actor_name=actor.full_name if actor else None,
            action=entry.action,
            target_type=entry.target_type,
            target_id=entry.target_id,
            details=entry.details,
            created_at=entry.created_at,
        )
        for entry, actor in rows
    ]


@router.get("/storage", response_model=list[PlatformStorageObjectResponse])
def storage_objects(
    session: SessionDep,
    admin: User = _admin("storage"),
    prefix: str = Query(default="", max_length=500),
) -> list[PlatformStorageObjectResponse]:
    del session, admin
    try:
        objects = sorted(list_objects(prefix), key=lambda item: item.get("LastModified") or datetime.min, reverse=True)
    except STORAGE_ERRORS as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    return [
        PlatformStorageObjectResponse(
            key=str(item["Key"]),
            size=int(item.get("Size") or 0),
            last_modified=item.get("LastModified"),
            etag=str(item.get("ETag") or "").strip('"') or None,
            url=str(item["url"]),
        )
        for item in objects
    ]


@router.delete("/storage", response_model=MessageResponse)
def remove_storage_object(
    key: str,
    session: SessionDep,
    admin: User = _admin("storage"),
) -> MessageResponse:
    try:
        delete_object(key)
    except (STORAGE_ERRORS, ValueError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    audit(session, admin, "storage_object_deleted", "r2_object", key)
    return MessageResponse(message=f"Deleted {key}")


@router.post("/broadcasts", response_model=PlatformBroadcastResponse)
def broadcasts(
    payload: PlatformBroadcastRequest,
    session: SessionDep,
    admin: User = _admin("broadcasts"),
) -> PlatformBroadcastResponse:
    allowed_channels = {"email", "sms"}
    channels = set(payload.channels)
    if not channels or not channels <= allowed_channels:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Channels must contain email and/or sms")
    query = select(User).where(User.is_active.is_(True))
    if not payload.send_to_all:
        if not payload.user_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select users or enable send_to_all")
        query = query.where(col(User.id).in_(payload.user_ids))
    recipients = session.exec(query).all()
    email_sent = 0
    sms_sent = 0
    failed = 0
    sms_numbers: list[str] = []
    if "email" in channels:
        for user in recipients:
            try:
                body = payload.message.replace("{name}", user.full_name).replace("{email}", user.email)
                send_email(user.email, payload.subject, f"<p>{escape(body).replace(chr(10), '<br>')}</p>")
                email_sent += 1
            except Exception:
                failed += 1
    if "sms" in channels:
        for user in recipients:
            if not user.phone_number:
                failed += 1
                continue
            try:
                sms_numbers.append(normalize_sms_phone(user.phone_number))
            except ValueError:
                failed += 1
        if sms_numbers:
            try:
                send_sms(payload.message, sms_numbers)
                sms_sent = len(sms_numbers)
            except Exception:
                failed += len(sms_numbers)
    audit(
        session,
        admin,
        "broadcast_sent",
        "users",
        details={"recipients": len(recipients), "channels": sorted(channels), "subject": payload.subject},
    )
    return PlatformBroadcastResponse(
        recipients=len(recipients),
        email_sent=email_sent,
        sms_sent=sms_sent,
        failed=failed,
    )


@router.get("/dns/zones", response_model=list[PlatformDnsZoneResponse])
def dns_zones(admin: User = _admin("dns")) -> list[PlatformDnsZoneResponse]:
    del admin
    try:
        return [PlatformDnsZoneResponse(**zone) for zone in list_zones()]
    except DnsProviderError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.get("/dns/zones/{zone_id}/records", response_model=list[PlatformDnsRecordResponse])
def dns_records(zone_id: str, admin: User = _admin("dns")) -> list[PlatformDnsRecordResponse]:
    del admin
    try:
        return [PlatformDnsRecordResponse(**record) for record in list_records(zone_id)]
    except DnsProviderError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.post("/dns/zones/{zone_id}/records", response_model=MessageResponse)
def add_dns_record(
    zone_id: str,
    payload: PlatformDnsRecordCreate,
    session: SessionDep,
    admin: User = _admin("dns"),
) -> MessageResponse:
    record = payload.model_dump(exclude_none=True)
    try:
        create_record(zone_id, record)
    except DnsProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    audit(
        session,
        admin,
        "dns_record_created",
        "dns_zone",
        zone_id,
        {"provider": dns_provider_name(), **record},
    )
    return MessageResponse(message="DNS record created")


@router.delete("/dns/zones/{zone_id}/records/{record_id}", response_model=MessageResponse)
def remove_dns_record(
    zone_id: str,
    record_id: str,
    session: SessionDep,
    admin: User = _admin("dns"),
) -> MessageResponse:
    try:
        delete_record(zone_id, record_id)
    except DnsProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    audit(
        session,
        admin,
        "dns_record_deleted",
        "dns_record",
        record_id,
        {"zone_id": zone_id, "provider": dns_provider_name()},
    )
    return MessageResponse(message="DNS record deleted")


@router.post("/wallets/{wallet_id}/freeze", response_model=MessageResponse)
def set_wallet_frozen(
    wallet_id: UUID,
    frozen: bool,
    session: SessionDep,
    admin: User = _admin("finance"),
) -> MessageResponse:
    if not session.get(BranchWallet, wallet_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Wallet not found")
    freeze_wallet(session, wallet_id, frozen)
    audit(session, admin, "wallet_freeze_changed", "wallet", str(wallet_id), {"frozen": frozen})
    return MessageResponse(message=f"Wallet {'frozen' if frozen else 'unfrozen'}")


@router.get("/health", response_model=PlatformHealthResponse)
def health(
    session: SessionDep,
    admin: User = _admin("system"),
) -> PlatformHealthResponse:
    del admin
    try:
        session.exec(select(func.count(User.id))).one()
        database = "online"
    except Exception:
        database = "offline"
    cutoff = datetime.utcnow() - timedelta(hours=24)
    error_rows = session.exec(
        select(RouterErrorLog)
        .where(RouterErrorLog.created_at >= cutoff)
        .order_by(RouterErrorLog.created_at.desc())
    ).all()
    statuses = [
        database,
        "configured" if settings.r2_account_id and settings.r2_bucket_name else "not configured",
        "configured" if dns_is_configured() else "not configured",
        "configured" if settings.resend_key else "not configured",
        "configured" if settings.africastalking_api_key else "not configured",
        "configured" if settings.marz_api_credentials else "not configured",
    ]
    return PlatformHealthResponse(
        status="healthy" if database == "online" else "degraded",
        database=database,
        concentrator_enabled=settings.concentrator_enabled,
        snmp_monitor_enabled=settings.snmp_monitor_enabled,
        r2=statuses[1],
        dns=statuses[2],
        dns_provider=dns_provider_name(),
        email=statuses[3],
        sms=statuses[4],
        payment_gateway=statuses[5],
        router_errors_24h=len(error_rows),
        last_router_error=error_rows[0].message if error_rows else None,
    )
