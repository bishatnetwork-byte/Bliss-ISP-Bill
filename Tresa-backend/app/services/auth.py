import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.email_verification import EmailVerification
from app.models.user import User
from app.models.staff import Staff
from app.schemas.auth import AuthResponse, UserResponse
from app.services.email import send_welcome_email
from app.services.security import create_access_token, hash_code, normalize_email


def create_verification_code(session: Session, email: str) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    verification = EmailVerification(
        email=normalize_email(email),
        code_hash=hash_code(email, code),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    session.add(verification)
    session.commit()
    return code


def verify_email_code(session: Session, email: str, code: str) -> User:
    normalized_email = normalize_email(email)
    user = session.exec(select(User).where(User.email == normalized_email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    verification = session.exec(
        select(EmailVerification)
        .where(EmailVerification.email == normalized_email)
        .where(EmailVerification.used_at.is_(None))
        .order_by(EmailVerification.created_at.desc())
    ).first()
    if not verification or verification.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code expired")
    if not hmac.compare_digest(verification.code_hash, hash_code(normalized_email, code)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")

    verification.used_at = datetime.utcnow()
    user.is_verified = True
    user.updated_at = datetime.utcnow()
    session.add(verification)
    session.add(user)
    session.commit()
    session.refresh(user)

    send_welcome_email(user)
    return user


def verify_reset_code(session: Session, email: str, code: str, new_password_hash: str) -> User:
    """Validate a password-reset code and update the user's password."""
    normalized_email = normalize_email(email)
    user = session.exec(select(User).where(User.email == normalized_email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    verification = session.exec(
        select(EmailVerification)
        .where(EmailVerification.email == normalized_email)
        .where(EmailVerification.used_at.is_(None))
        .order_by(EmailVerification.created_at.desc())
    ).first()
    if not verification or verification.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset code expired or not found")
    if not hmac.compare_digest(verification.code_hash, hash_code(normalized_email, code)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset code")

    verification.used_at = datetime.utcnow()
    user.password_hash = new_password_hash
    user.updated_at = datetime.utcnow()
    session.add(verification)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def user_response(user: User, session: Session | None = None) -> UserResponse:
    staff = None
    if session is not None:
        from app.core.config import settings

        bootstrap_admins = {
            email.strip().lower()
            for email in settings.platform_admin_emails.split(",")
            if email.strip()
        }
        if user.email.lower() in bootstrap_admins and user.platform_role != "superadmin":
            user.platform_role = "superadmin"
            user.platform_permissions = "*"
            session.add(user)
            session.commit()
            session.refresh(user)
        staff = session.exec(select(Staff).where(Staff.user_id == user.id).where(Staff.is_active.is_(True))).first()
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone_number=user.phone_number,
        is_verified=user.is_verified,
        avatar_url=user.avatar_url,
        auth_provider="google" if user.google_sub and not user.password_hash else "email_password",
        account_type="staff" if staff else "owner",
        is_active=user.is_active,
        allowed_sections=[item.strip() for item in (user.allowed_sections or "").split(",") if item.strip()],
        platform_role=user.platform_role,
        platform_permissions=[item.strip() for item in (user.platform_permissions or "").split(",") if item.strip()],
        staff_branch_id=staff.branch_id if staff else None,
        staff_role=staff.role if staff else None,
        staff_permissions=[item.strip() for item in (staff.permissions or "").split(",") if item.strip()] if staff else [],
        share_percentage=staff.share_percentage if staff else 0,
    )


def auth_response(user: User, session: Session | None = None) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(user), user=user_response(user, session))
