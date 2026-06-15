from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import select

from app.api.deps import CurrentUser
from app.db.session import SessionDep
from app.models import User, Branch
from app.services.avatar import get_user_avatar, get_branch_avatar
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    GoogleLoginUrlResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendCodeRequest,
    ResetPasswordRequest,
    SetPasswordRequest,
    UserResponse,
    VerifyEmailRequest,
)
from app.services.auth import auth_response, create_verification_code, user_response, verify_email_code, verify_reset_code
from app.services.email import send_password_reset_email, send_verification_email, send_welcome_email
from app.services.google import build_google_login_url, exchange_google_code_for_id_token, verify_google_id_token
from app.services.notification import (
    notify_email_verified,
    notify_google_linked,
    notify_login,
    notify_password_changed,
    notify_password_reset_complete,
    notify_password_reset_requested,
    notify_password_set,
    notify_registration,
    notify_welcome,
)
from app.services.security import hash_password, normalize_email, verify_password

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: SessionDep) -> MessageResponse:
    email = normalize_email(str(payload.email))
    existing_user = session.exec(select(User).where(User.email == email)).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        phone_number=payload.phone_number.strip(),
        password_hash=hash_password(payload.password),
        avatar_url=get_user_avatar(email),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Create default branch
    branch_name = f"{user.full_name} Branch"
    default_branch = Branch(
        name=branch_name,
        avatar_url=get_branch_avatar(branch_name),
        user_id=user.id,
    )
    session.add(default_branch)
    session.commit()

    notify_registration(session, user.id, user.full_name)

    code = create_verification_code(session, email)
    send_verification_email(email, user.full_name, code)
    return MessageResponse(message="Account created. Check your email for the verification code.")


@router.post("/verify-email", response_model=AuthResponse)
def verify_email(payload: VerifyEmailRequest, session: SessionDep) -> AuthResponse:
    user = verify_email_code(session, str(payload.email), payload.code)
    notify_email_verified(session, user.id)
    return auth_response(user, session)


@router.post("/resend-code", response_model=MessageResponse)
def resend_code(payload: ResendCodeRequest, session: SessionDep) -> MessageResponse:
    email = normalize_email(str(payload.email))
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_verified:
        return MessageResponse(message="Email is already verified.")

    code = create_verification_code(session, email)
    send_verification_email(email, user.full_name, code)
    return MessageResponse(message="A new verification code has been sent.")


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: SessionDep) -> AuthResponse:
    email = normalize_email(str(payload.email))
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
    if not user.is_verified:
        code = create_verification_code(session, email)
        send_verification_email(email, user.full_name, code)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified. A new code has been sent.")

    notify_login(session, user.id)
    return auth_response(user, session)


@router.get("/google/login-url", response_model=GoogleLoginUrlResponse)
def google_login_url(redirect_uri: str | None = None) -> GoogleLoginUrlResponse:
    return GoogleLoginUrlResponse(authorization_url=build_google_login_url(redirect_uri))


def authenticate_google_profile(
    session: SessionDep,
    profile: dict,
    full_name: str | None = None,
    phone_number: str | None = None,
) -> AuthResponse:
    email = normalize_email(profile["email"])
    user = session.exec(select(User).where(User.email == email)).first()
    is_new_user = user is None

    if not user:
        user = User(
            email=email,
            full_name=(full_name or profile.get("name") or email.split("@")[0]).strip(),
            phone_number=phone_number,
            google_sub=profile.get("sub"),
            is_verified=True,
            avatar_url=get_user_avatar(email),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Create default branch
        branch_name = f"{user.full_name} Branch"
        default_branch = Branch(
            name=branch_name,
            avatar_url=get_branch_avatar(branch_name),
            user_id=user.id,
        )
        session.add(default_branch)
        session.commit()
    else:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
        user.google_sub = user.google_sub or profile.get("sub")
        user.full_name = full_name or user.full_name or profile.get("name") or email.split("@")[0]
        user.phone_number = phone_number or user.phone_number
        user.is_verified = True
        if not user.avatar_url:
            user.avatar_url = get_user_avatar(email)
        user.updated_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)

    if is_new_user:
        send_welcome_email(user)
        notify_welcome(session, user.id, user.full_name)
    else:
        notify_google_linked(session, user.id)
        notify_login(session, user.id)
    return auth_response(user, session)


@router.get("/google/callback", response_model=AuthResponse)
def google_callback(code: str, request: Request, session: SessionDep) -> AuthResponse:
    google_id_token = exchange_google_code_for_id_token(code, authorization_response=str(request.url))
    profile = verify_google_id_token(google_id_token)
    return authenticate_google_profile(session, profile)


@router.post("/google", response_model=AuthResponse)
def google_auth(payload: GoogleAuthRequest, session: SessionDep) -> AuthResponse:
    if not payload.id_token and not payload.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Send a real Google id_token or authorization code")

    google_id_token = payload.id_token
    if payload.code:
        google_id_token = exchange_google_code_for_id_token(payload.code, payload.redirect_uri)

    profile = verify_google_id_token(google_id_token or "")
    return authenticate_google_profile(session, profile, payload.full_name, payload.phone_number)


@router.post("/set-password", response_model=MessageResponse)
def set_password(payload: SetPasswordRequest, user: CurrentUser, session: SessionDep) -> MessageResponse:
    had_password = bool(user.password_hash)
    if had_password:
        if not payload.current_password or not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()

    if had_password:
        notify_password_changed(session, user.id)
    else:
        notify_password_set(session, user.id)
    return MessageResponse(message="Password has been set successfully.")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, session: SessionDep) -> MessageResponse:
    email = normalize_email(str(payload.email))
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        return MessageResponse(message="If that email exists, a reset code has been sent.")

    code = create_verification_code(session, email)
    send_password_reset_email(email, user.full_name, code)
    notify_password_reset_requested(session, user.id)
    return MessageResponse(message="If that email exists, a reset code has been sent.")


@router.post("/reset-password", response_model=AuthResponse)
def reset_password(payload: ResetPasswordRequest, session: SessionDep) -> AuthResponse:
    new_hash = hash_password(payload.new_password)
    user = verify_reset_code(session, str(payload.email), payload.code, new_hash)
    notify_password_reset_complete(session, user.id)
    return auth_response(user, session)


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser, session: SessionDep) -> UserResponse:
    return user_response(user, session)
