from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=120)
    phone_number: str = Field(min_length=5, max_length=30)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendCodeRequest(BaseModel):
    email: EmailStr


class SetPasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)


class GoogleAuthRequest(BaseModel):
    id_token: Optional[str] = None
    code: Optional[str] = None
    redirect_uri: Optional[str] = None
    full_name: Optional[str] = Field(default=None, max_length=120)
    phone_number: Optional[str] = Field(default=None, max_length=30)


class GoogleLoginUrlResponse(BaseModel):
    authorization_url: str


class SubdomainHandoffRequest(BaseModel):
    code: str = Field(min_length=20)
    subdomain: str = Field(min_length=3, max_length=63)


class SubdomainHandoffResponse(BaseModel):
    code: str
    subdomain: str
    expires_in: int = 60


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    phone_number: Optional[str]
    is_verified: bool
    avatar_url: Optional[str]
    auth_provider: str
    account_type: str = "owner"
    is_active: bool = True
    allowed_sections: list[str] = Field(default_factory=list)
    platform_role: Optional[str] = None
    platform_permissions: list[str] = Field(default_factory=list)
    account_subdomain: Optional[str] = None
    subdomain_enabled: bool = False
    staff_branch_id: Optional[UUID] = None
    staff_role: Optional[str] = None
    staff_permissions: list[str] = Field(default_factory=list)
    share_percentage: float = 0


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
