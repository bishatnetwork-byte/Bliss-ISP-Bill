from typing import Any

import africastalking
import requests
from sqlmodel import Session

from app.core.config import settings
from app.services.platform_admin import get_setting


SMS_GATEWAY_DEFINITIONS: dict[str, dict[str, Any]] = {
    "africastalking": {
        "id": "africastalking",
        "label": "Africa's Talking",
        "fields": ["username", "api_key", "sender_id"],
    },
    "julysms": {
        "id": "julysms",
        "label": "JulySMS",
        "fields": ["client_id", "client_secret"],
    },
}


def _env_gateway_config(provider: str) -> dict[str, Any]:
    if provider == "julysms":
        return {
            "client_id": settings.julysms_client_id,
            "client_secret": settings.julysms_client_secret,
        }
    return {
        "username": settings.africastalking_username,
        "api_key": settings.africastalking_api_key,
        "sender_id": settings.africastalking_sender_id,
    }


def _merged_gateway_config(session: Session | None, provider: str) -> dict[str, Any]:
    stored = {}
    if session is not None:
        stored = (get_setting(session, "sms_gateways", {}) or {}).get(provider, {}) or {}
    env_config = _env_gateway_config(provider)
    return {
        **env_config,
        **{key: value for key, value in stored.items() if value not in (None, "")},
    }


def configured_sms_gateways(session: Session | None = None) -> dict[str, dict[str, Any]]:
    stored_gateways = get_setting(session, "sms_gateways", {}) if session is not None else {}
    stored_gateways = stored_gateways or {}
    configured: dict[str, dict[str, Any]] = {}
    for provider, definition in SMS_GATEWAY_DEFINITIONS.items():
        stored = stored_gateways.get(provider, {}) or {}
        config = _merged_gateway_config(session, provider)
        has_credentials = _gateway_has_credentials(provider, config)
        configured[provider] = {
            "id": provider,
            "label": definition["label"],
            "enabled": bool(stored.get("enabled", provider == "africastalking")),
            "is_configured": has_credentials,
            "credentials_source": "dashboard" if any(stored.get(field) for field in definition["fields"]) else "env" if has_credentials else "missing",
            "sender_id": config.get("sender_id"),
        }
    return configured


def default_sms_gateway(session: Session | None = None) -> str:
    provider = get_setting(session, "sms_gateway_default", "africastalking") if session is not None else "africastalking"
    gateways = configured_sms_gateways(session)
    if provider in gateways and gateways[provider]["enabled"] and gateways[provider]["is_configured"]:
        return provider
    for fallback, row in gateways.items():
        if row["enabled"] and row["is_configured"]:
            return fallback
    return str(provider or "africastalking")


def _gateway_has_credentials(provider: str, config: dict[str, Any]) -> bool:
    if provider == "julysms":
        return bool(config.get("client_id") and config.get("client_secret"))
    return bool(config.get("username") and config.get("api_key"))


def normalize_sms_phone(phone_number: str) -> str:
    digits = "".join(character for character in phone_number if character.isdigit())
    if digits.startswith("256") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 10:
        return f"+256{digits[1:]}"
    if digits.startswith("7") and len(digits) == 9:
        return f"+256{digits}"
    if phone_number.strip().startswith("+") and 10 <= len(digits) <= 15:
        return f"+{digits}"
    raise ValueError(f"Invalid phone number: {phone_number}")


def render_voucher_message(template: str, wifi_name: str, voucher_code: str) -> str:
    message = template.replace("{wifi_name}", wifi_name).replace("{code}", voucher_code)
    if "{}" in message:
        message = message.replace("{}", voucher_code)
    return message


def _send_africastalking_sms(message: str, recipients: list[str], config: dict[str, Any]) -> dict[str, Any]:
    if not _gateway_has_credentials("africastalking", config):
        raise RuntimeError("Africa's Talking credentials are not configured")

    africastalking.initialize(
        config["username"],
        config["api_key"],
    )
    response = africastalking.SMS.send(
        message,
        recipients,
        sender_id=config.get("sender_id") or None,
        enqueue=settings.africastalking_enqueue,
    )
    result = response if isinstance(response, dict) else {"response": response}
    result.setdefault("__provider", "africastalking")
    return result


def _julysms_phone(phone_number: str) -> str:
    normalized = normalize_sms_phone(phone_number)
    if normalized.startswith("+256") and len(normalized) == 13:
        return f"0{normalized[4:]}"
    return normalized.lstrip("+")


def _send_julysms_sms(message: str, recipients: list[str], config: dict[str, Any]) -> dict[str, Any]:
    if not _gateway_has_credentials("julysms", config):
        raise RuntimeError("JulySMS credentials are not configured")
    payload: dict[str, Any] = {"message": message}
    july_numbers = [_julysms_phone(recipient) for recipient in recipients]
    if len(july_numbers) == 1:
        payload["phone"] = july_numbers[0]
    else:
        payload["phones"] = july_numbers
    response = requests.post(
        f"{settings.julysms_api_base_url}/sms/send",
        json=payload,
        headers={
            "Client-ID": str(config["client_id"]),
            "Client-Secret": str(config["client_secret"]),
        },
        timeout=20,
    )
    try:
        data = response.json()
    except ValueError:
        data = {"raw": response.text}
    if response.status_code >= 400:
        raise RuntimeError(f"JulySMS request failed ({response.status_code}): {data}")
    if isinstance(data, dict):
        data.setdefault("__provider", "julysms")
        data.setdefault("__http_status", response.status_code)
        return data
    return {"response": data, "__provider": "julysms", "__http_status": response.status_code}


def send_sms(message: str, recipients: list[str], session: Session | None = None) -> dict[str, Any]:
    provider = default_sms_gateway(session)
    gateways = configured_sms_gateways(session)
    if provider not in gateways:
        raise RuntimeError(f"SMS gateway {provider} is not supported")
    if not gateways[provider]["enabled"]:
        raise RuntimeError(f"SMS gateway {gateways[provider]['label']} is disabled")

    config = _merged_gateway_config(session, provider)
    if provider == "julysms":
        return _send_julysms_sms(message, recipients, config)
    return _send_africastalking_sms(message, recipients, config)


def check_sms_gateway_balance(provider: str, session: Session | None = None) -> dict[str, Any]:
    if provider != "julysms":
        raise RuntimeError("Balance checking is only available for JulySMS")
    config = _merged_gateway_config(session, provider)
    if not _gateway_has_credentials("julysms", config):
        raise RuntimeError("JulySMS credentials are not configured")
    response = requests.get(
        f"{settings.julysms_api_base_url}/sms/balance",
        headers={
            "Client-ID": str(config["client_id"]),
            "Client-Secret": str(config["client_secret"]),
        },
        timeout=20,
    )
    try:
        data = response.json()
    except ValueError:
        data = {"raw": response.text}
    if response.status_code >= 400:
        raise RuntimeError(f"JulySMS balance request failed ({response.status_code}): {data}")
    return data if isinstance(data, dict) else {"response": data}


def sms_was_accepted(response: dict[str, Any], phone_number: str) -> bool:
    if response.get("__provider") == "julysms":
        status = str(response.get("status") or response.get("message_status") or response.get("state") or "").lower()
        success = response.get("success")
        if isinstance(success, bool):
            return success
        if status:
            return status in {"ok", "success", "sent", "queued", "accepted", "processing", "processed"}
        return response.get("error") is None

    message_data = response.get("SMSMessageData")
    if not isinstance(message_data, dict):
        return True
    recipients = message_data.get("Recipients")
    if not isinstance(recipients, list):
        return True

    normalized_target = normalize_sms_phone(phone_number)
    for recipient in recipients:
        if not isinstance(recipient, dict):
            continue
        try:
            recipient_number = normalize_sms_phone(str(recipient.get("number", "")))
        except ValueError:
            continue
        if recipient_number != normalized_target:
            continue
        status_code = recipient.get("statusCode")
        status_name = str(recipient.get("status", "")).lower()
        return status_code in {100, 101, 102} or status_name in {
            "processed",
            "success",
            "sent",
            "queued",
        }
    return False


def sms_failure_reason(response: dict[str, Any], phone_number: str) -> str:
    if response.get("__provider") == "julysms":
        return str(
            response.get("error")
            or response.get("message")
            or response.get("detail")
            or "JulySMS did not accept this message"
        )

    message_data = response.get("SMSMessageData")
    recipients = message_data.get("Recipients") if isinstance(message_data, dict) else None
    if not isinstance(recipients, list):
        return "SMS provider did not return recipient delivery details"
    normalized_target = normalize_sms_phone(phone_number)
    for recipient in recipients:
        if not isinstance(recipient, dict):
            continue
        try:
            recipient_number = normalize_sms_phone(str(recipient.get("number", "")))
        except ValueError:
            continue
        if recipient_number == normalized_target:
            status_name = str(recipient.get("status") or "Rejected")
            status_code = recipient.get("statusCode")
            return f"{status_name}{f' (provider code {status_code})' if status_code is not None else ''}"
    return "SMS provider omitted this recipient from its response"
