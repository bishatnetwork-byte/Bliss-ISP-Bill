from datetime import datetime, timedelta
from html import escape
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.api.deps import platform_admin, platform_admin_any
from app.core.config import settings
from app.db.session import SessionDep
from app.models.branch import Branch
from app.models.branch_wallet import BranchWallet
from app.models.platform_admin import PlatformAuditLog, VoucherActivationAudit
from app.models.platform_ledger import PlatformLedgerEntry
from app.models.message import MessageLog
from app.models.router import Router
from app.models.router_event import RouterErrorLog
from app.models.telegram_connection import TelegramConnection
from app.models.user import User
from app.models.voucher_purchase import VoucherPurchase
from app.schemas.auth import MessageResponse
from app.schemas.platform_admin import (
    PlatformAuditResponse,
    PlatformBroadcastRequest,
    PlatformBroadcastResponse,
    PlatformDnsRecordResponse,
    PlatformDnsRecordCreate,
    PlatformDnsZoneResponse,
    PlatformHealthResponse,
    PlatformMessageDiagnosticResponse,
    PlatformOverviewResponse,
    PlatformSettingsResponse,
    PlatformSettingsUpdate,
    PlatformStorageObjectResponse,
    PlatformSubadminUpdate,
    PlatformTunnelResponse,
    PlatformUserBranchResponse,
    PlatformUserDetailResponse,
    PlatformUserResponse,
    PlatformUserRouterResponse,
    PlatformUserUpdate,
    PlatformUserVoucherResponse,
    PlatformVoucherAuditResponse,
    PlatformWalletResponse,
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
        )
        for user, branches, routers, vouchers, balance in rows
    ]


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
    audit(session, admin, "user_updated", "user", str(target.id), payload.model_dump(exclude_none=True))
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
