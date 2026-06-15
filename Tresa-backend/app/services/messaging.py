from typing import Any

import africastalking

from app.core.config import settings


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


def send_sms(message: str, recipients: list[str]) -> dict[str, Any]:
    if not settings.africastalking_username or not settings.africastalking_api_key:
        raise RuntimeError("Africa's Talking credentials are not configured")

    africastalking.initialize(
        settings.africastalking_username,
        settings.africastalking_api_key,
    )
    response = africastalking.SMS.send(
        message,
        recipients,
        sender_id=settings.africastalking_sender_id,
        enqueue=settings.africastalking_enqueue,
    )
    return response if isinstance(response, dict) else {"response": response}


def sms_was_accepted(response: dict[str, Any], phone_number: str) -> bool:
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
