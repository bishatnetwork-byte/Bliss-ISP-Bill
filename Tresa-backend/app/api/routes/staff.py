from datetime import datetime
import secrets
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import CurrentUser
from app.db.session import SessionDep
from app.models.branch import Branch
from app.models.staff import Staff
from app.models.user import User
from app.models.router import Router
from app.models.voucher_purchase import VoucherPurchase
from app.schemas.auth import MessageResponse
from app.schemas.staff import RevenueShareAgent, RevenueShareResponse, StaffCreate, StaffResponse, StaffUpdate
from app.services.access import require_branch_access
from app.services.avatar import get_staff_avatar
from app.services.email import send_staff_invite_email
from app.services.notification import notify
from app.services.portal import normalize_router_name
from app.services.security import hash_password, normalize_email

router = APIRouter(tags=["Staff"])
ALLOWED_PERMISSIONS = {"dashboard", "routers", "sales", "vouchers", "support", "network", "captive"}
ALLOWED_ROLES = {"admin", "manager", "support", "staff"}


def check_branch_ownership(session: SessionDep, branch_id: UUID, user_id: UUID) -> Branch:
    """Helper to verify that a branch exists and belongs to the current user."""
    branch = session.exec(
        select(Branch)
        .where(Branch.id == branch_id)
        .where(Branch.user_id == user_id)
    ).first()
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found or access denied",
        )
    return branch


def get_staff_with_ownership(session: SessionDep, staff_id: UUID, user_id: UUID) -> Staff:
    """Helper to retrieve a staff member after verifying ownership of their branch."""
    staff = session.get(Staff, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")
    check_branch_ownership(session, staff.branch_id, user_id)
    return staff


def serialize_staff(staff: Staff) -> StaffResponse:
    return StaffResponse(
        id=staff.id,
        branch_id=staff.branch_id,
        user_id=staff.user_id,
        full_name=staff.full_name,
        email=staff.email,
        phone_number=staff.phone_number,
        role=staff.role,
        permissions=[item for item in staff.permissions.split(",") if item],
        share_percentage=staff.share_percentage,
        is_active=staff.is_active,
        avatar_url=staff.avatar_url,
        created_at=staff.created_at,
        updated_at=staff.updated_at,
    )


def validate_permissions(values: list[str]) -> str:
    normalized = {value.strip().lower() for value in values}
    invalid = normalized - ALLOWED_PERMISSIONS
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported staff permissions: {', '.join(sorted(invalid))}",
        )
    normalized.add("dashboard")
    return ",".join(sorted(normalized))


def validate_role(value: str | None) -> str:
    role = (value or "staff").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported staff role. Choose one of: {', '.join(sorted(ALLOWED_ROLES))}",
        )
    return role


def validate_total_share(session: SessionDep, branch_id: UUID, percentage: float, exclude_id: UUID | None = None) -> None:
    rows = session.exec(select(Staff).where(Staff.branch_id == branch_id).where(Staff.is_active.is_(True))).all()
    allocated = sum(item.share_percentage for item in rows if item.id != exclude_id)
    if allocated + percentage > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Agent shares cannot exceed 100%. Already allocated: {allocated:g}%.",
        )


@router.get("/branches/{branch_id}/staff", response_model=list[StaffResponse])
def list_branch_staff(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=100, ge=1),
    offset: int = Query(default=0, ge=0),
) -> list[StaffResponse]:
    """List all staff members associated with a specific branch."""
    check_branch_ownership(session, branch_id, user.id)

    staff_members = session.exec(
        select(Staff)
        .where(Staff.branch_id == branch_id)
        .offset(offset)
        .limit(limit)
    ).all()

    return [serialize_staff(s) for s in staff_members]


@router.get("/branches/{branch_id}/revenue-share", response_model=RevenueShareResponse)
def branch_revenue_share(
    branch_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> RevenueShareResponse:
    branch, current_staff = require_branch_access(session, branch_id, user, "dashboard")
    router_names = session.exec(select(Router.name).where(Router.branch_id == branch_id)).all()
    gross_sales = 0
    if router_names:
        # VoucherPurchase.router_name is always stored normalized (see
        # get_or_create_wallet), while Router.name keeps whatever casing the
        # owner typed — normalize before matching or sales come back as 0.
        normalized_names = [normalize_router_name(name) for name in router_names]
        gross_sales = int(session.exec(
            select(func.coalesce(func.sum(VoucherPurchase.amount), 0))
            .where(col(VoucherPurchase.router_name).in_(normalized_names))
        ).one())
    staff_rows = session.exec(
        select(Staff).where(Staff.branch_id == branch_id).where(Staff.is_active.is_(True))
    ).all()
    allocated = sum(item.share_percentage for item in staff_rows)
    agents = [
        RevenueShareAgent(
            staff_id=item.id,
            full_name=item.full_name,
            percentage=item.share_percentage,
            amount=round(gross_sales * item.share_percentage / 100),
        )
        for item in staff_rows
    ]
    current_percentage = current_staff.share_percentage if current_staff else max(0, 100 - allocated)
    return RevenueShareResponse(
        branch_id=branch.id,
        gross_sales=gross_sales,
        allocated_percentage=allocated,
        owner_percentage=max(0, 100 - allocated),
        owner_amount=round(gross_sales * max(0, 100 - allocated) / 100),
        current_user_percentage=current_percentage,
        current_user_amount=round(gross_sales * current_percentage / 100),
        agents=agents,
    )


@router.post("/branches/{branch_id}/staff", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
def add_branch_staff(
    branch_id: UUID,
    payload: StaffCreate,
    user: CurrentUser,
    session: SessionDep,
) -> StaffResponse:
    """Add a new staff member to a branch, auto-assigning a Dicebear avatar."""
    branch = check_branch_ownership(session, branch_id, user.id)

    email = normalize_email(str(payload.email))
    existing = session.exec(
        select(Staff)
        .where(Staff.branch_id == branch_id)
        .where(Staff.email == email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Staff member with this email already exists in this branch",
        )

    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already belongs to an existing account",
        )
    permissions = validate_permissions(payload.permissions)
    validate_total_share(session, branch_id, payload.share_percentage)
    temporary_password = secrets.token_urlsafe(12)
    agent_user = User(
        email=email,
        full_name=payload.full_name.strip(),
        phone_number=payload.phone_number.strip() if payload.phone_number else None,
        password_hash=hash_password(temporary_password),
        is_verified=True,
        avatar_url=get_staff_avatar(email),
    )
    session.add(agent_user)
    session.flush()

    staff = Staff(
        branch_id=branch_id,
        user_id=agent_user.id,
        full_name=payload.full_name.strip(),
        email=email,
        phone_number=payload.phone_number.strip() if payload.phone_number else None,
        role=validate_role(payload.role),
        permissions=permissions,
        share_percentage=payload.share_percentage,
        avatar_url=get_staff_avatar(email),
    )
    session.add(staff)
    send_staff_invite_email(email, staff.full_name, branch.name, staff.role, temporary_password)
    session.commit()
    session.refresh(staff)
    notify(
        session,
        user.id,
        "staff",
        f"{staff.full_name} invited",
        f"{staff.full_name} was invited to {branch.name} with a {staff.share_percentage:g}% revenue share.",
    )
    return serialize_staff(staff)


@router.put("/staff/{staff_id}", response_model=StaffResponse)
def update_staff(
    staff_id: UUID,
    payload: StaffUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> StaffResponse:
    """Update a staff member's details."""
    staff = get_staff_with_ownership(session, staff_id, user.id)

    if payload.full_name is not None:
        staff.full_name = payload.full_name.strip()
    if payload.email is not None:
        new_email = payload.email.strip().lower()
        if new_email != staff.email:
            # Check duplicates in the branch
            existing = session.exec(
                select(Staff)
                .where(Staff.branch_id == staff.branch_id)
                .where(Staff.email == new_email)
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already in use by another staff member in this branch",
                )
            staff.email = new_email
            # Auto-update avatar if it wasn't manually overridden in this call
            if payload.avatar_url is None:
                staff.avatar_url = get_staff_avatar(new_email)
    if payload.phone_number is not None:
        staff.phone_number = payload.phone_number.strip() if payload.phone_number else None
    if payload.role is not None:
        staff.role = validate_role(payload.role)
    if payload.permissions is not None:
        staff.permissions = validate_permissions(payload.permissions)
    if payload.share_percentage is not None:
        validate_total_share(session, staff.branch_id, payload.share_percentage, staff.id)
        staff.share_percentage = payload.share_percentage
    if payload.is_active is not None:
        staff.is_active = payload.is_active
    if payload.avatar_url is not None:
        staff.avatar_url = payload.avatar_url.strip()

    staff.updated_at = datetime.utcnow()
    session.add(staff)
    session.commit()
    session.refresh(staff)

    return serialize_staff(staff)


@router.delete("/staff/{staff_id}", response_model=MessageResponse)
def delete_staff(
    staff_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MessageResponse:
    """Remove a staff member from a branch."""
    staff = get_staff_with_ownership(session, staff_id, user.id)
    agent_user = session.get(User, staff.user_id) if staff.user_id else None
    session.delete(staff)
    if agent_user:
        session.delete(agent_user)
    session.commit()
    return MessageResponse(message="Staff member removed successfully.")
