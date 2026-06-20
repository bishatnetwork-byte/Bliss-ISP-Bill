from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlmodel import select

from app.db.session import SessionDep
from app.models.user import User
from app.models.user_session import UserSession
from app.services.security import decode_access_token


def current_user(
    session: SessionDep,
    authorization: Annotated[Optional[str], Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    payload = decode_access_token(authorization.split(" ", 1)[1])
    try:
        user_id = UUID(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    jti = payload.get("jti")
    if jti:
        user_session = session.exec(
            select(UserSession).where(UserSession.jti == jti)
        ).first()
        if not user_session or user_session.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has been revoked")
        user_session.last_seen_at = datetime.utcnow()
        session.add(user_session)
        session.commit()

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
    if user.blocked_until and user.blocked_until > datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is temporarily blocked")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def platform_admin(permission: str | None = None):
    def dependency(request: Request, user: CurrentUser, session: SessionDep) -> User:
        if user.platform_role not in {"superadmin", "subadmin"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform administrator access required")
        permissions = {
            item.strip()
            for item in (user.platform_permissions or "").split(",")
            if item.strip()
        }
        if user.platform_role != "superadmin" and permission and permission not in permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing platform permission: {permission}")
        from app.models.platform_admin import PlatformAuditLog
        from app.services.platform_admin import get_setting
        from app.services.telegram import send_user_event

        session.add(PlatformAuditLog(
            actor_id=user.id,
            action="platform_access",
            target_type="api",
            target_id=request.url.path,
            details={"method": request.method},
        ))
        session.commit()
        if bool(get_setting(session, "telegram_access_alerts", False)):
            send_user_event(
                session,
                user.id,
                "platform_admin",
                f"<b>Platform admin access</b>\n{request.method} {request.url.path}",
            )
        return user

    return dependency


def platform_admin_any(*required_permissions: str):
    def dependency(request: Request, user: CurrentUser, session: SessionDep) -> User:
        base = platform_admin()(request, user, session)
        if user.platform_role == "superadmin":
            return base
        permissions = {
            item.strip()
            for item in (user.platform_permissions or "").split(",")
            if item.strip()
        }
        if not permissions.intersection(required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these platform permissions is required: {', '.join(required_permissions)}",
            )
        return base

    return dependency
