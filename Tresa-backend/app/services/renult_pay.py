"""MarzPay mobile money gateway integration.

Formerly a separate "Renult Pay" service deployed at
https://renult-pay.vercel.app. That service was a thin wrapper that verified
a customer's MSISDN through Lucopay before calling MarzPay's
collection/disbursement API. This module now does the same thing in-process,
so the captive portal voucher payments and branch withdrawal payouts no
longer need a network hop to a separate deployment.

The public functions below keep their original signatures and return shapes
so existing callers (app.services.portal, app.api.routes.wallet) work
unchanged.
"""

from typing import Any
from uuid import UUID

import requests

from app.core.config import settings


class RenultPayError(Exception):
    """The payment provider request failed outright (network error or rejected request)."""


# MarzPay's collection/disbursement responses wrap the actual transaction in
# `data.transaction`, e.g.
#   {"status": "success", "data": {"transaction": {"uuid": "...", "status": "processing", ...}}}
# The top-level `status`/`message` only describe whether the *API call*
# itself succeeded - NOT whether the mobile money payment succeeded. The
# payment's real status/uuid must always be read from `data.transaction`.
_STATUS_KEYS = ("status", "payment_status", "transaction_status", "collection_status", "state")
_COLLECTION_UUID_KEYS = ("collection_uuid", "uuid", "id", "collection_id", "transaction_uuid")


def _transaction(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        transaction = data.get("transaction")
        if isinstance(transaction, dict):
            return transaction
    return {}


_SUCCESS_STATUSES = {
    "SUCCESS",
    "SUCCESSFUL",
    "SUCCEEDED",
    "COMPLETED",
    "COMPLETE",
    "PAID",
    "APPROVED",
    "CONFIRMED",
    "DONE",
}
_FAILED_STATUSES = {
    "FAILED",
    "FAILURE",
    "ERROR",
    "ERRORED",
    "CANCELLED",
    "CANCELED",
    "REJECTED",
    "DECLINED",
    "EXPIRED",
    "TIMEOUT",
    "TIMED_OUT",
    "REVERSED",
    "NOT_FOUND",
}


def _verify_identity(phone_number: str) -> dict[str, Any]:
    """Verify a Ugandan MSISDN via the Lucopay identity API."""
    try:
        response = requests.post(
            settings.identity_api_url,
            json={"msisdn": phone_number},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=settings.payment_provider_timeout_seconds,
        )
    except requests.RequestException as exc:
        raise RenultPayError(f"Identity verification service is unavailable: {exc}") from exc

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code >= 400 or not isinstance(data, dict) or not data.get("success"):
        message = data.get("message") if isinstance(data, dict) else None
        raise RenultPayError(str(message or "Customer phone number could not be verified"))

    return {
        "identityname": data.get("identityname"),
        "message": data.get("message"),
        "success": data.get("success"),
    }


def _marz_request(method: str, path: str, form_data: dict[str, str] | None = None) -> dict[str, Any]:
    if not settings.marz_api_credentials:
        raise RenultPayError("MarzPay credentials are not configured")

    try:
        response = requests.request(
            method,
            f"{settings.marz_api_base_url}{path}",
            data=form_data,
            headers={
                "Accept": "application/json",
                "Authorization": f"Basic {settings.marz_api_credentials}",
            },
            timeout=settings.payment_provider_timeout_seconds,
        )
    except requests.RequestException as exc:
        raise RenultPayError(f"MarzPay service is unavailable: {exc}") from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise RenultPayError("MarzPay returned an invalid response") from exc

    if response.status_code >= 400:
        message = data.get("message") if isinstance(data, dict) else None
        raise RenultPayError(str(message or "MarzPay rejected the request"))

    return data if isinstance(data, dict) else {}


def _collection_form(
    amount: int,
    phone_number: str,
    reference: UUID,
    description: str | None,
    callback_url: str | None = None,
) -> dict[str, str]:
    form = {
        "amount": str(amount),
        "phone_number": phone_number,
        "country": "UG",
        "reference": str(reference),
    }
    if description:
        form["description"] = description[:255]
    if callback_url:
        form["callback_url"] = callback_url
    return form


def _with_identity(response: dict[str, Any], key: str, identity: dict[str, Any]) -> dict[str, Any]:
    result = dict(response)
    data = result.get("data")
    result["data"] = {**(data if isinstance(data, dict) else {}), key: identity}
    return result


def initialize_collection(
    amount: int,
    phone_number: str,
    reference: UUID,
    description: str | None = None,
    callback_url: str | None = None,
) -> dict[str, Any]:
    """Start a mobile money collection. `phone_number` must be E.164 (+256...)."""
    identity = _verify_identity(phone_number)
    form = _collection_form(amount, phone_number, reference, description, callback_url)
    response = _marz_request("POST", "/collect-money", form)
    return _with_identity(response, "customer_identity", identity)


def verify_collection(collection_uuid: str) -> dict[str, Any]:
    """Check the current status of a previously initialized collection."""
    return _marz_request("GET", f"/collect-money/{collection_uuid}")


def send_money(
    amount: int,
    phone_number: str,
    reference: UUID,
    description: str | None = None,
    callback_url: str | None = None,
) -> dict[str, Any]:
    """Disburse money to a recipient's mobile money wallet. `phone_number` must be E.164 (+256...)."""
    identity = _verify_identity(phone_number)
    form = _collection_form(amount, phone_number, reference, description, callback_url)
    response = _marz_request("POST", "/send-money", form)
    return _with_identity(response, "recipient_identity", identity)


def get_send_money_status(reference: str) -> dict[str, Any]:
    """Check the current status of a previously requested disbursement."""
    return _marz_request("GET", f"/send-money/{reference}")


def extract_status(payload: dict[str, Any]) -> str | None:
    transaction = _transaction(payload)
    for key in _STATUS_KEYS:
        value = transaction.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def extract_collection_uuid(payload: dict[str, Any]) -> str | None:
    transaction = _transaction(payload)
    for key in _COLLECTION_UUID_KEYS:
        value = transaction.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def normalize_status(raw: str | None) -> str:
    """Collapse the gateway's many possible status spellings to PENDING/SUCCESS/FAILED."""
    value = (raw or "").strip().upper().replace("-", "_").replace(" ", "_")
    if value in _SUCCESS_STATUSES:
        return "SUCCESS"
    if value in _FAILED_STATUSES:
        return "FAILED"
    return "PENDING"
