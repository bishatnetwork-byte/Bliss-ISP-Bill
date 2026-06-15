"""Request schema for the in-process MarzPay payment gateway API.

Ported from the standalone Renult Pay gateway (formerly
https://renult-pay.vercel.app) so /v1/pay and /send-money keep the same
request contract now that they're served by this application.
"""

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


UGANDAN_PHONE_PATTERN = re.compile(r"^\+256\d{9}$")


def normalize_ugandan_phone(value: str) -> str:
    phone = re.sub(r"[\s()-]", "", value.strip())

    if phone.startswith("0"):
        phone = f"+256{phone[1:]}"
    elif phone.startswith("256"):
        phone = f"+{phone}"
    elif phone.isdigit() and len(phone) == 9:
        phone = f"+256{phone}"

    if not UGANDAN_PHONE_PATTERN.fullmatch(phone):
        raise ValueError("Phone number must be a valid Ugandan number")
    return phone


class CollectionRequest(BaseModel):
    amount: int = Field(ge=500, le=10_000_000, examples=[1000])
    phone_number: str = Field(examples=["+256700000000"])
    country: Literal["UG"] = "UG"
    reference: UUID = Field(
        description="A unique UUID v4 reference",
        examples=["123e4567-e89b-42d3-a456-426614174000"],
    )
    description: str | None = Field(default=None, max_length=255)
    callback_url: HttpUrl | None = Field(default=None, max_length=255)

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: str) -> str:
        return normalize_ugandan_phone(value)

    @field_validator("reference")
    @classmethod
    def validate_reference(cls, value: UUID) -> UUID:
        if value.version != 4:
            raise ValueError("Reference must be a UUID v4")
        return value
