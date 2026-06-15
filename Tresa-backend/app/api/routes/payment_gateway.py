"""MarzPay payment gateway API.

Ported from the standalone Renult Pay gateway (formerly
https://renult-pay.vercel.app) so these endpoints continue to exist under
the same paths now that the integration runs in-process. See
app.services.renult_pay for the underlying MarzPay/Lucopay calls.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.schemas.payment_gateway import CollectionRequest
from app.services import renult_pay


payments_router = APIRouter(prefix="/v1/pay", tags=["Payments"])
send_money_router = APIRouter(prefix="/send-money", tags=["Send Money"])


@payments_router.post("/initialize", status_code=status.HTTP_201_CREATED)
def initialize_collection(request: CollectionRequest) -> dict[str, Any]:
    try:
        return renult_pay.initialize_collection(
            amount=request.amount,
            phone_number=request.phone_number,
            reference=request.reference,
            description=request.description,
            callback_url=str(request.callback_url) if request.callback_url else None,
        )
    except renult_pay.RenultPayError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@payments_router.get("/verify/{collection_uuid}")
def verify_collection(collection_uuid: UUID) -> dict[str, Any]:
    try:
        return renult_pay.verify_collection(str(collection_uuid))
    except renult_pay.RenultPayError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@send_money_router.post("", status_code=status.HTTP_201_CREATED)
def send_money(request: CollectionRequest) -> dict[str, Any]:
    try:
        return renult_pay.send_money(
            amount=request.amount,
            phone_number=request.phone_number,
            reference=request.reference,
            description=request.description,
            callback_url=str(request.callback_url) if request.callback_url else None,
        )
    except renult_pay.RenultPayError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@send_money_router.get("/{transaction_uuid}")
def get_send_money(transaction_uuid: UUID) -> dict[str, Any]:
    try:
        return renult_pay.get_send_money_status(str(transaction_uuid))
    except renult_pay.RenultPayError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
