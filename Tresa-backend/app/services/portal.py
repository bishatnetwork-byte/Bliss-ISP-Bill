import ftplib
import io
import json
import logging
import os
import re
import secrets
from urllib.parse import quote
from datetime import datetime, timedelta
from html import escape
from pathlib import Path
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlmodel import Session, select

from app.core.config import settings
from app.models.captive_portal import CaptivePortal
from app.models.branch import Branch
from app.models.branch_wallet import BranchWallet, BranchWalletTransaction
from app.models.message import MessageLog
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.platform_ledger import PlatformLedgerEntry
from app.models.portal_payment import PortalPayment
from app.models.router import Router
from app.models.staff import Staff
from app.models.user import User
from app.models.voucher_purchase import VoucherPurchase
from app.models.wallet import Wallet
from app.services import renult_pay
from app.services import wallet as wallet_svc
from app.services.messaging import (
    normalize_sms_phone,
    render_voucher_message,
    send_sms,
    sms_failure_reason,
    sms_was_accepted,
)
from app.services.routers.Packages import get_router_packages
from app.services.routers.routeros import RouterApiSession, router_connection
from app.services.storage import STORAGE_ERRORS, object_url, refresh_logo_url, upload_bytes
from app.services.telegram import branch_has_event_connection, send_branch_event, verified_phone_name
from app.services.platform_admin import get_setting


logger = logging.getLogger(__name__)

PORTAL_ROOT = Path("app/portal")
CAPTIVE_PORTAL_R2_PREFIX = "captive-portal"
DEFAULT_CAPTIVE_TITLE = "Renault WIFI"
DEFAULT_CAPTIVE_DESCRIPTION = "High-speed internet access portal"

# The gateway only accepts collections within this range (UGX).
PAYMENT_MIN_AMOUNT = 500
PAYMENT_MAX_AMOUNT = 10_000_000

# Minimum time between calls to the gateway's verify endpoint for a single
# payment, so a fast-polling browser tab can't hammer the gateway.
PAYMENT_VERIFY_INTERVAL = timedelta(seconds=2)


def normalize_router_name(router_name: str) -> str:
    return router_name.strip().upper()


def normalize_phone(phone_number: str) -> str:
    phone = phone_number.replace(" ", "").replace("-", "").strip()
    if phone.startswith("+"):
        phone = phone[1:]
    if phone.startswith("0") and len(phone) == 10:
        return "256" + phone[1:]
    if phone.startswith("7") and len(phone) == 9:
        return "256" + phone
    return phone


def gateway_phone(phone_number: str) -> str:
    """E.164 phone number for the Renult Pay gateway, e.g. "+256700000000"."""
    return f"+{normalize_phone(phone_number)}"


_PUBLIC_ID_SUFFIX_RE = re.compile(r"^[0-9A-Fa-f]{6}$")


def router_public_id(router: Router) -> str:
    """Stable, URL-safe identifier for a router's public portal/API calls.

    Two routers can share the same display name, so the deployed captive
    portal embeds this composite id (NAME-<6 hex chars of the router's UUID>)
    instead of the bare name to keep package/voucher lookups unambiguous.
    """
    return f"{normalize_router_name(router.name)}-{router.id.hex[:6].upper()}"


def find_router_by_name(session: Session, router_name: str) -> Router | None:
    raw = (router_name or "").strip()

    if "-" in raw:
        name_part, suffix = raw.rsplit("-", 1)
        if _PUBLIC_ID_SUFFIX_RE.match(suffix):
            suffix_lower = suffix.lower()
            normalized_name = normalize_router_name(name_part)
            candidates = session.exec(
                select(Router).where(sa.func.upper(Router.name) == normalized_name)
            ).all()
            for candidate in candidates:
                if candidate.id.hex.startswith(suffix_lower):
                    return candidate
            for candidate in session.exec(select(Router)).all():
                if candidate.id.hex.startswith(suffix_lower):
                    return candidate

    normalized = normalize_router_name(raw)
    return session.exec(
        select(Router).where(sa.func.upper(Router.name) == normalized)
    ).first()


def default_captive_config(router_name: str) -> dict[str, Any]:
    return {
        "id": None,
        "router_id": None,
        "router_name": normalize_router_name(router_name),
        "title": DEFAULT_CAPTIVE_TITLE,
        "description": DEFAULT_CAPTIVE_DESCRIPTION,
        "phone_one": None,
        "phone_two": None,
        "logo_url": None,
        "portal_template": "renault",
        "last_pushed_at": None,
    }


def get_public_captive_config(session: Session, router_name: str) -> dict[str, Any]:
    router = find_router_by_name(session, router_name)
    if not router:
        return default_captive_config(router_name)

    captive = session.exec(
        select(CaptivePortal).where(CaptivePortal.router_id == router.id)
    ).first()
    if not captive:
        return {
            **default_captive_config(router.name),
            "router_id": router.id,
            "router_name": router.name,
        }

    return {
        "id": captive.id,
        "router_id": captive.router_id,
        "router_name": captive.router_name,
        "title": captive.title,
        "description": captive.description,
        "phone_one": captive.phone_one,
        "phone_two": captive.phone_two,
        "logo_url": refresh_logo_url(captive.logo_url),
        "portal_template": captive.portal_template,
        "last_pushed_at": captive.last_pushed_at,
    }


def get_or_create_wallet(session: Session, router_name: str, phone_number: str) -> Wallet:
    normalized_router_name = normalize_router_name(router_name)
    normalized_phone = normalize_phone(phone_number)
    wallet = session.exec(
        select(Wallet)
        .where(Wallet.router_name == normalized_router_name)
        .where(Wallet.phone_number == normalized_phone)
    ).first()
    if wallet:
        return wallet

    wallet = Wallet(router_name=normalized_router_name, phone_number=normalized_phone)
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    return wallet


def find_package(session: Session, router_name: str, package_id: int) -> dict[str, Any] | None:
    packages = get_router_packages(router_name, session)["voucher"]
    return next((package for package in packages if package["package_id"] == package_id), None)


def generate_voucher_code(session: Session) -> str:
    while True:
        code = "".join(secrets.choice("0123456789") for _ in range(8))
        exists = session.exec(select(VoucherPurchase).where(VoucherPurchase.voucher_code == code)).first()
        if not exists:
            return code


def _hotspot_limit_to_routeros(limit: str) -> str | None:
    normalized = limit.strip().lower().replace(" ", "")
    if not normalized:
        return None

    human_duration = re.fullmatch(
        r"(\d+)(seconds?|minutes?|hours?|days?|weeks?|months?)",
        normalized,
    )
    if human_duration:
        value = int(human_duration.group(1))
        unit = human_duration.group(2).rstrip("s")
        if unit == "month":
            return f"{value * 30}d"
        suffixes = {
            "second": "s",
            "minute": "m",
            "hour": "h",
            "day": "d",
            "week": "w",
        }
        return f"{value}{suffixes[unit]}"

    return normalized


def _first_resource_id(items: list[dict[str, Any]]) -> str | None:
    if not items:
        return None
    return items[0].get("id") or items[0].get(".id")


def _upsert_hotspot_voucher(router: Router, voucher: VoucherPurchase, package: dict[str, Any]) -> None:
    errors = _upsert_hotspot_vouchers(router, [voucher], package)
    if errors:
        raise RuntimeError(errors[voucher.voucher_code])


def _upsert_hotspot_vouchers(
    router: Router,
    vouchers: list[VoucherPurchase],
    package: dict[str, Any],
) -> dict[str, str]:
    if not vouchers:
        return {}

    errors: dict[str, str] = {}
    with router_connection(router) as api:
        profile_resource = api.get_resource("/ip/hotspot/user/profile")
        user_resource = api.get_resource("/ip/hotspot/user")

        profile_name = vouchers[0].profile
        existing_profile = profile_resource.get(name=profile_name)
        if not existing_profile:
            profile_resource.add(name=profile_name, **{"shared-users": package["devices"]})

        existing_users = {
            str(item.get("name", "")): item
            for item in user_resource.get()
            if item.get("name")
        }
        limit_uptime = _hotspot_limit_to_routeros(package.get("limit", ""))

        for voucher in vouchers:
            params: dict[str, Any] = {
                "name": voucher.voucher_code,
                "password": voucher.voucher_code,
                "profile": voucher.profile,
                "comment": f"{voucher.phone_number} package={voucher.package_id} ref={voucher.payment_reference or ''}".strip(),
            }
            if limit_uptime:
                params["limit-uptime"] = limit_uptime

            try:
                existing_user = existing_users.get(voucher.voucher_code)
                user_id = _first_resource_id([existing_user] if existing_user else [])
                if user_id:
                    user_resource.set(id=user_id, **{key: value for key, value in params.items() if key != "name"})
                else:
                    user_resource.add(**params)
            except Exception as exc:
                errors[voucher.voucher_code] = str(exc)

    return errors


def _delete_hotspot_vouchers(router: Router, voucher_codes: list[str]) -> tuple[int, list[str]]:
    target_codes = set(voucher_codes)
    if not target_codes:
        return 0, []

    deleted = 0
    errors: list[str] = []
    try:
        with router_connection(router) as api:
            active_resource = api.get_resource("/ip/hotspot/active")
            user_resource = api.get_resource("/ip/hotspot/user")

            active_sessions = [
                item for item in active_resource.get()
                if str(item.get("user") or "") in target_codes
            ]
            hotspot_users = {
                str(item.get("name") or ""): item
                for item in user_resource.get()
                if str(item.get("name") or "") in target_codes
            }

            pending: list[tuple[str, str, Any]] = []
            for active in active_sessions:
                voucher_code = str(active.get("user") or "")
                active_id = active.get("id") or active.get(".id")
                if active_id:
                    pending.append((voucher_code, "active session", active_resource.remove_async(id=active_id)))

            for voucher_code, user in hotspot_users.items():
                user_id = user.get("id") or user.get(".id")
                if user_id:
                    pending.append((voucher_code, "hotspot user", user_resource.remove_async(id=user_id)))

            for voucher_code, resource_name, promise in pending:
                try:
                    promise.get()
                    if resource_name == "hotspot user":
                        deleted += 1
                except Exception as exc:
                    errors.append(f"{voucher_code} ({resource_name}): {exc}")
    except Exception as exc:
        errors.extend(f"{voucher_code}: {exc}" for voucher_code in target_codes)
    return deleted, errors


def _delete_hotspot_voucher(router: Router, voucher_code: str) -> bool:
    deleted, errors = _delete_hotspot_vouchers(router, [voucher_code])
    if errors:
        raise RuntimeError(errors[0])
    return deleted > 0


def notify_branch_staff(session: Session, router: Router, title: str, body: str, category: str = "vouchers") -> None:
    branch = session.get(Branch, router.branch_id)
    if not branch:
        return

    user_ids = {branch.user_id}
    staff = session.exec(select(Staff).where(Staff.branch_id == branch.id)).all()
    staff_emails = [item.email for item in staff if item.email]
    if staff_emails:
        users = session.exec(select(User).where(User.email.in_(staff_emails))).all()
        user_ids.update(user.id for user in users)

    for user_id in user_ids:
        session.add(Notification(user_id=user_id, category=category, title=title, body=body))


def _create_and_provision_voucher(
    session: Session,
    router: Router,
    wallet: Wallet,
    package: dict[str, Any],
    payment_reference: str,
) -> VoucherPurchase:
    """Create a PAID voucher, credit the branch wallet, and push it to MikroTik.

    MikroTik sync failures are recorded on the voucher (ROUTER_SYNC_FAILED)
    rather than raised, since the customer's cash has already been collected
    and must be reflected in the branch wallet regardless.
    """
    amount = int(package["total"])

    voucher = VoucherPurchase(
        wallet_id=wallet.id,
        router_name=wallet.router_name,
        phone_number=wallet.phone_number,
        voucher_code=generate_voucher_code(session),
        package_id=package["package_id"],
        profile=package["profile"],
        speed_type=package["speed_type"],
        amount=amount,
        devices=package["devices"],
        data=package["data"],
        payment_reference=payment_reference,
        status="PAID",
    )
    session.add(voucher)
    notify_branch_staff(
        session,
        router,
        title="Voucher bought",
        body=f"{wallet.phone_number} bought {package['profile']} for UGX {amount:,} on {router.name}.",
    )
    session.commit()
    session.refresh(wallet)
    session.refresh(voucher)

    branch = session.get(Branch, router.branch_id)
    if branch:
        branch_wallet = wallet_svc.ensure_wallet(session, branch.id)
        voucher_fee_type = str(get_setting(session, "voucher_fee_type", "percentage"))
        voucher_fee_value = float(get_setting(session, "voucher_fee_value", 0))
        voucher_fee = (
            wallet_svc._calc_fee(amount, voucher_fee_value / 100)
            if voucher_fee_type == "percentage"
            else int(voucher_fee_value)
        )
        wallet_svc.deposit(
            session=session,
            wallet_id=branch_wallet.id,
            amount=amount,
            user_id=branch.user_id,
            reference=payment_reference or voucher.voucher_code,
            fee_amount_override=voucher_fee,
            fee_type="VOUCHER_FEE",
        )

    try:
        _upsert_hotspot_voucher(router, voucher, package)
        voucher.status = "PROVISIONED"
    except Exception:
        voucher.status = "ROUTER_SYNC_FAILED"
    session.add(voucher)
    session.commit()
    session.refresh(voucher)
    customer_name = (
        verified_phone_name(wallet.phone_number)
        if branch_has_event_connection(session, router.branch_id, "voucher_purchase")
        else None
    )
    send_branch_event(
        session,
        router.branch_id,
        "voucher_purchase",
        (
            "<b>Voucher purchased</b>\n"
            f"Customer: {escape(customer_name or 'Subscriber name unavailable')}\n"
            f"Identity: {'✅ Verified subscriber name' if customer_name else '⚠️ Name could not be verified'}\n"
            f"Phone: {escape(wallet.phone_number)}\n"
            f"Package: {escape(str(package['profile']))}\n"
            f"Amount: UGX {amount:,}\n"
            f"Voucher: <code>{escape(voucher.voucher_code)}</code>\n"
            f"Router: {escape(router.name)}\n"
            f"Status: {escape(voucher.status)}"
        ),
    )
    return voucher


def initiate_portal_payment(
    session: Session,
    router_name: str,
    phone_number: str,
    package_id: int,
    buy_for: str = "self",
) -> PortalPayment:
    """Start a mobile money collection for a captive portal voucher purchase.

    The voucher itself is only created once `refresh_portal_payment` observes
    a SUCCESS status from the gateway.
    """
    router = find_router_by_name(session, router_name)
    if not router:
        raise ValueError("Router not found for this portal")

    package = find_package(session, router.name, package_id)
    if not package:
        raise ValueError("Package not found for this router")

    amount = int(package["total"])
    if amount < PAYMENT_MIN_AMOUNT or amount > PAYMENT_MAX_AMOUNT:
        raise ValueError("This package's price is outside the payment gateway's allowed range")

    normalized_phone = normalize_phone(phone_number)
    payment = PortalPayment(
        router_name=normalize_router_name(router.name),
        phone_number=normalized_phone,
        package_id=package["package_id"],
        amount=amount,
        buy_for=(buy_for or "self").strip().lower() or "self",
        status="PENDING",
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)

    try:
        response = renult_pay.initialize_collection(
            amount=amount,
            phone_number=gateway_phone(normalized_phone),
            reference=payment.reference,
            description=f"{package['profile']} voucher on {router.name}",
        )
    except renult_pay.RenultPayError as exc:
        payment.status = "FAILED"
        payment.error = str(exc)
        payment.updated_at = datetime.utcnow()
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    gateway_status = renult_pay.extract_status(response)
    payment.collection_uuid = renult_pay.extract_collection_uuid(response)
    payment.gateway_status = gateway_status
    payment.gateway_response = json.dumps(response)[:8000]
    payment.status = renult_pay.normalize_status(gateway_status)
    if payment.status == "FAILED":
        payment.error = "The payment gateway rejected the collection request"
    payment.updated_at = datetime.utcnow()
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def _portal_sms_preferences(session: Session, user: User) -> NotificationPreference:
    preferences = session.exec(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    ).first()
    if preferences:
        return preferences
    preferences = NotificationPreference(user_id=user.id)
    session.add(preferences)
    session.commit()
    session.refresh(preferences)
    return preferences


def _charge_portal_sms(session: Session, branch: Branch, user: User, reference: str) -> tuple[bool, int]:
    wallet = session.exec(
        select(BranchWallet)
        .where(BranchWallet.branch_id == branch.id)
        .with_for_update()
    ).first()
    cost = settings.sms_notification_cost
    if not wallet or wallet.is_frozen or wallet.balance < cost:
        return False, wallet.balance if wallet else 0

    wallet.balance -= cost
    wallet.total_fees_paid += cost
    wallet.updated_at = datetime.utcnow()
    session.add(
        BranchWalletTransaction(
            wallet_id=wallet.id,
            branch_id=branch.id,
            amount=cost,
            fee_amount=cost,
            net_amount=0,
            transaction_type="SMS_NOTIFICATION",
            reference=reference,
        )
    )
    session.add(
        PlatformLedgerEntry(
            branch_wallet_id=wallet.id,
            branch_id=branch.id,
            user_id=user.id,
            amount=cost,
            fee_type="SMS_NOTIFICATION",
            source_amount=cost,
            fee_rate=1,
            reference=reference,
        )
    )
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    return True, wallet.balance


def _send_low_balance_sms(
    session: Session,
    branch: Branch,
    user: User,
    preferences: NotificationPreference,
    balance: int,
) -> None:
    warning_phone = preferences.sms_phone_number or user.phone_number
    if not warning_phone:
        return
    try:
        phone = normalize_sms_phone(warning_phone)
        message = (
            f"Renult Bulk SMS warning: {branch.name} SMS wallet balance is "
            f"UGX {balance:,}. Auto voucher SMS is paused until you top up."
        )
        response = send_sms(message, [phone])
        accepted = sms_was_accepted(response, phone)
        if accepted:
            _charge_portal_sms(session, branch, user, f"SMS-LOW-{branch.id}-{int(datetime.utcnow().timestamp())}")
    except Exception:
        return


def _send_portal_voucher_sms(
    session: Session,
    router: Router,
    payment: PortalPayment,
    voucher: VoucherPurchase,
) -> None:
    branch = session.get(Branch, router.branch_id)
    if not branch:
        return
    user = session.get(User, branch.user_id)
    if not user:
        return
    preferences = _portal_sms_preferences(session, user)
    if not preferences.bulk_sms_voucher_enabled:
        return
    if payment.buy_for != "self" and not preferences.bulk_sms_admin_buy_for_enabled:
        return

    wallet = session.exec(select(BranchWallet).where(BranchWallet.branch_id == branch.id)).first()
    balance = wallet.balance if wallet else 0
    if balance < preferences.bulk_sms_low_balance_threshold:
        if preferences.bulk_sms_low_balance_enabled and balance >= settings.sms_notification_cost:
            _send_low_balance_sms(session, branch, user, preferences, balance)
        session.add(
            Notification(
                user_id=user.id,
                category="wallet",
                title="Bulk SMS paused",
                body=(
                    f"{branch.name} SMS wallet balance is UGX {balance:,}. "
                    f"Top up to at least UGX {preferences.bulk_sms_low_balance_threshold:,}."
                ),
            )
        )
        session.commit()
        return

    try:
        phone = normalize_sms_phone(voucher.phone_number)
    except ValueError:
        return

    message = render_voucher_message(
        "{wifi_name}: your Wi-Fi voucher code is {code}.",
        router.name,
        voucher.voucher_code,
    )
    log = MessageLog(
        branch_id=branch.id,
        user_id=user.id,
        message=message,
        message_type="voucher",
        recipients=[phone],
        cost_per_sms=settings.sms_notification_cost,
    )
    session.add(log)
    session.commit()
    session.refresh(log)

    try:
        response = send_sms(message, [phone])
        accepted = sms_was_accepted(response, phone)
        charged, wallet_balance = (
            _charge_portal_sms(session, branch, user, f"SMS-PORTAL-{payment.reference}")
            if accepted
            else (False, balance)
        )
        failure = None if accepted else sms_failure_reason(response, phone)
        log.status = "completed" if accepted else "failed"
        log.sent = 1 if accepted else 0
        log.failed = 0 if accepted else 1
        log.results = [{
            "phone_number": phone,
            "success": accepted,
            "message": message if accepted else failure,
            "provider_response": response,
        }]
        log.error = failure
        log.total_charged = settings.sms_notification_cost if charged else 0
        log.wallet_balance = wallet_balance
        log.updated_at = datetime.utcnow()
        session.add(log)
        session.commit()
    except Exception as exc:
        log.status = "failed"
        log.failed = 1
        log.error = str(exc)
        log.updated_at = datetime.utcnow()
        session.add(log)
        session.commit()


def _finalize_payment_voucher(session: Session, payment: PortalPayment) -> PortalPayment:
    """Provision the voucher for a payment whose gateway status is SUCCESS."""
    router = find_router_by_name(session, payment.router_name)
    if not router:
        payment.error = "Payment succeeded but the router could not be found to provision the voucher"
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    package = find_package(session, router.name, payment.package_id)
    if not package:
        # The customer's cash has already been collected, so credit the
        # branch wallet and flag staff to follow up, instead of losing it.
        branch = session.get(Branch, router.branch_id)
        if branch:
            branch_wallet = wallet_svc.ensure_wallet(session, branch.id)
            wallet_svc.deposit(
                session=session,
                wallet_id=branch_wallet.id,
                amount=payment.amount,
                user_id=branch.user_id,
                reference=str(payment.reference),
            )
        notify_branch_staff(
            session,
            router,
            title="Payment received but package unavailable",
            body=(
                f"{payment.phone_number} paid UGX {payment.amount:,} on {router.name}, "
                "but the selected package is no longer available. Please contact the customer."
            ),
        )
        payment.error = "Payment received, but the package is no longer available. Please contact support."
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    wallet = get_or_create_wallet(session, router.name, payment.phone_number)
    voucher = _create_and_provision_voucher(session, router, wallet, package, str(payment.reference))
    payment.voucher_id = voucher.id
    session.add(payment)
    session.commit()
    session.refresh(payment)
    _send_portal_voucher_sms(session, router, payment, voucher)
    return payment


def refresh_portal_payment(session: Session, router_name: str, reference: UUID) -> PortalPayment:
    """Re-check a pending payment's status with the gateway and provision its voucher on success."""
    router = find_router_by_name(session, router_name)
    canonical_name = normalize_router_name(router.name) if router else normalize_router_name(router_name)
    payment = session.exec(
        select(PortalPayment)
        .where(PortalPayment.reference == reference)
        .where(PortalPayment.router_name == canonical_name)
    ).first()
    if not payment:
        raise ValueError("Payment not found")

    if payment.status != "PENDING" or not payment.collection_uuid:
        return payment

    now = datetime.utcnow()
    if payment.last_checked_at and now - payment.last_checked_at < PAYMENT_VERIFY_INTERVAL:
        return payment

    try:
        response = renult_pay.verify_collection(payment.collection_uuid)
    except renult_pay.RenultPayError as exc:
        payment.last_checked_at = now
        payment.error = str(exc)
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    gateway_status = renult_pay.extract_status(response)
    normalized = renult_pay.normalize_status(gateway_status)
    payment.gateway_status = gateway_status
    payment.gateway_response = json.dumps(response)[:8000]
    payment.last_checked_at = now
    payment.updated_at = now

    if normalized == "SUCCESS":
        payment.status = "SUCCESS"
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return _finalize_payment_voucher(session, payment)

    if normalized == "FAILED":
        payment.status = "FAILED"
        payment.error = payment.error or "The payment was not completed"

    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def get_portal_payment(session: Session, router_name: str, reference: UUID) -> PortalPayment | None:
    router = find_router_by_name(session, router_name)
    canonical_name = normalize_router_name(router.name) if router else normalize_router_name(router_name)
    return session.exec(
        select(PortalPayment)
        .where(PortalPayment.reference == reference)
        .where(PortalPayment.router_name == canonical_name)
    ).first()


def find_vouchers(session: Session, router_name: str, phone_number: str) -> list[VoucherPurchase]:
    router = find_router_by_name(session, router_name)
    canonical_name = normalize_router_name(router.name) if router else normalize_router_name(router_name)
    return session.exec(
        select(VoucherPurchase)
        .where(VoucherPurchase.router_name == canonical_name)
        .where(VoucherPurchase.phone_number == normalize_phone(phone_number))
        .order_by(VoucherPurchase.created_at.desc())
    ).all()


def _ftp_router_diagnostics(router: Router) -> dict[str, str]:
    diagnostics: dict[str, str] = {}
    try:
        with router_connection(router) as api:
            ftp_services = api.get_resource("/ip/service").get(name="ftp")
            if ftp_services:
                service = ftp_services[0]
                diagnostics["service_disabled"] = str(service.get("disabled", "false"))
                diagnostics["service_port"] = str(service.get("port", "21"))
                diagnostics["service_available_from"] = str(service.get("address", "all"))

            users = api.get_resource("/user").get(name=router.username)
            if users:
                group_name = str(users[0].get("group", "unknown"))
                diagnostics["router_user"] = router.username
                diagnostics["router_user_group"] = group_name
                groups = api.get_resource("/user/group").get(name=group_name)
                if groups:
                    diagnostics["router_user_policies"] = str(groups[0].get("policy", "unknown"))
    except Exception as exc:
        diagnostics["diagnostic_error"] = str(exc)
    return diagnostics


def _router_directory_name(router_name: str) -> str:
    directory = re.sub(r"[^A-Za-z0-9._-]+", "-", router_name.strip()).strip("-._")
    return directory or "router"


def _portal_api_base() -> str:
    return settings.portal_public_api_url


def _render_portal_file(path: Path, router: Router) -> bytes:
    content = path.read_bytes()
    if path.suffix.lower() not in {".html", ".css", ".js", ".txt"}:
        return content

    text = content.decode("utf-8")
    return (
        text.replace("__PORTAL_API_BASE__", _portal_api_base())
        .replace("__ROUTER_PUBLIC_ID__", router_public_id(router))
        .replace("__ROUTER_NAME__", normalize_router_name(router.name))
        .encode("utf-8")
    )


# Extra hosts that specific portal templates reach directly from the browser
# (fonts, third-party widgets, etc.) and therefore need walled-garden access
# before the visitor authenticates.
_TEMPLATE_EXTRA_WALLED_GARDEN_HOSTS: dict[str, list[str]] = {
    "auroaa": ["fonts.googleapis.com", "fonts.gstatic.com", "hspotagent.com"],
}

# Older adsmob deployments added these broad hosts to the pre-login walled
# garden. Remove them on the next deploy so normal YouTube browsing cannot
# bypass hotspot authentication.
_LEGACY_ADSMOB_WALLED_GARDEN_HOSTS: tuple[str, ...] = (
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "googlevideo.com",
    "youtubei.googleapis.com",
    "googleapis.com",
    "ytimg.com",
    "ggpht.com",
    "googleusercontent.com",
    "google.com",
    "gstatic.com",
    "doubleclick.net",
    "googleadservices.com",
)

# Mobile money providers used by the Renult Pay gateway. Some MTN/Airtel
# payment-confirmation flows open in the customer's browser, so these need
# walled-garden access before the visitor has authenticated.
_MOBILE_MONEY_WALLED_GARDEN_HOSTS: list[str] = [
    "mtn.co.ug",
    "mtn.com",
    "airtel.co.ug",
    "airtel.africa",
]


def _host_from_url(url: str) -> str:
    return re.sub(r"^https?://", "", url).split("/", 1)[0].split(":", 1)[0].strip().lower()


def _walled_garden_host_patterns(host: str) -> list[str]:
    """Exact host plus a `*.host` wildcard so subdomains are allowed too."""
    host = host.strip().lower()
    if not host:
        return []
    # Both the portal API and the Renult Pay gateway are hosted on Vercel
    # (`*.vercel.app`). A single `vercel.app` wildcard entry covers both
    # today and any future Vercel-hosted endpoint without further changes.
    if host == "vercel.app" or host.endswith(".vercel.app"):
        return ["vercel.app", "*.vercel.app"]
    return [host, f"*.{host}"]


def _walled_garden_hosts_for_template(
    template: str,
    router: Router,
    session: Session | None = None,
) -> list[str]:
    api_host = _host_from_url(_portal_api_base())
    payment_host = _host_from_url(settings.renult_pay_base_url)
    r2_host = _host_from_url(settings.r2_public_base_url or settings.r2_endpoint_url or "")

    base_hosts = [
        api_host,
        payment_host,
        r2_host,
        *_MOBILE_MONEY_WALLED_GARDEN_HOSTS,
    ]
    hosts: list[str] = []
    for host in (*base_hosts, *_TEMPLATE_EXTRA_WALLED_GARDEN_HOSTS.get(template, [])):
        for pattern in _walled_garden_host_patterns(host):
            if pattern not in hosts:
                hosts.append(pattern)
    return hosts


# RouterOS script + scheduler that re-adds any missing payment walled-garden
# entries on boot and periodically thereafter (e.g. if `/ip hotspot setup` is
# re-run and clears the walled-garden list). Named distinctly from the
# router's other schedulers (RunHeartbeat, RunHeartbeatCleanup,
# RunChrPingFailover, FixDNSonBoot, ...).
_WALLED_GARDEN_SYNC_NAME = "TresaWalledGardenSync"


def _walled_garden_sync_script_source(host_patterns: list[str]) -> str:
    hosts_literal = ";".join(f'"{host}"' for host in host_patterns)
    return (
        f":local hosts {{{hosts_literal}}}\n"
        ":foreach h in=$hosts do={\n"
        "    :if ([:len [/ip hotspot walled-garden find where dst-host=$h]] = 0) do={\n"
        '        /ip hotspot walled-garden add action=allow dst-host=$h comment="Tresa: payment walled garden"\n'
        "    }\n"
        "}\n"
    )


def _sync_walled_garden_scheduler(api: Any, host_patterns: list[str]) -> None:
    # "policy" is intentionally excluded: the tresa-monitor API user's own
    # group is `api,read,write,test`, and RouterOS refuses to assign a script
    # or scheduler a policy right the calling user doesn't itself hold
    # ("user's policy does not allow to set such script policy"). The script
    # only reads/writes walled-garden entries, so read+write+test is enough.
    script_resource = api.get_resource("/system/script")
    script_params = {
        "source": _walled_garden_sync_script_source(host_patterns),
        "policy": "read,write,test",
        "comment": "Tresa: re-add payment walled-garden entries if missing",
    }
    script_id = _first_resource_id(script_resource.get(name=_WALLED_GARDEN_SYNC_NAME))
    if script_id:
        script_resource.set(id=script_id, **script_params)
    else:
        script_resource.add(name=_WALLED_GARDEN_SYNC_NAME, **script_params)

    scheduler_resource = api.get_resource("/system/scheduler")
    scheduler_params = {
        "interval": "00:10:00",
        "on-event": f"/system script run {_WALLED_GARDEN_SYNC_NAME}",
        "policy": "read,write,test",
        "comment": "Tresa: keep payment walled-garden entries in place",
    }
    scheduler_id = _first_resource_id(scheduler_resource.get(name=_WALLED_GARDEN_SYNC_NAME))
    if scheduler_id:
        scheduler_resource.set(id=scheduler_id, **scheduler_params)
    else:
        scheduler_resource.add(name=_WALLED_GARDEN_SYNC_NAME, **{"start-time": "startup", **scheduler_params})


def _set_hotspot_portal_configuration(
    router: Router,
    directory: str,
    template: str = "renault",
    session: Session | None = None,
) -> tuple[list[str], list[str]]:
    updated_profiles: list[str] = []
    allowed_hosts: list[str] = []
    with router_connection(router) as api:
        hotspot_resource = api.get_resource("/ip/hotspot")
        profile_resource = api.get_resource("/ip/hotspot/profile")
        profile_names = {
            str(item.get("profile", "")).strip()
            for item in hotspot_resource.get()
            if item.get("profile")
        }
        if not profile_names:
            profile_names = {
                str(item.get("name", "")).strip()
                for item in profile_resource.get()
                if item.get("name") and item.get("name") != "default"
            }

        for profile_name in sorted(profile_names):
            profiles = profile_resource.get(name=profile_name)
            profile_id = _first_resource_id(profiles)
            if not profile_id:
                continue
            profile_resource.set(id=profile_id, **{"html-directory": directory})
            updated_profiles.append(profile_name)

        walled_garden = api.get_resource("/ip/hotspot/walled-garden")
        existing_entries = walled_garden.get()
        if template == "adsmob":
            legacy_patterns = {
                pattern
                for host in _LEGACY_ADSMOB_WALLED_GARDEN_HOSTS
                for pattern in _walled_garden_host_patterns(host)
            }
            for item in existing_entries:
                host = str(item.get("dst-host", "")).strip().lower()
                entry_id = item.get(".id") or item.get("id")
                if host in legacy_patterns and entry_id:
                    walled_garden.remove(id=entry_id)
            existing_entries = [
                item
                for item in existing_entries
                if str(item.get("dst-host", "")).strip().lower() not in legacy_patterns
            ]
        existing_hosts = {
            str(item.get("dst-host", "")).strip().lower()
            for item in existing_entries
            if item.get("dst-host")
        }
        for host_pattern in _walled_garden_hosts_for_template(template, router, session):
            if host_pattern.lower() not in existing_hosts:
                walled_garden.add(action="allow", **{"dst-host": host_pattern})
                existing_hosts.add(host_pattern.lower())
            allowed_hosts.append(host_pattern)

        try:
            _sync_walled_garden_scheduler(api, allowed_hosts)
        except Exception:
            # Self-healing scheduler is a best-effort extra; the walled-garden
            # entries above are already applied, so don't fail the deployment
            # over a router whose API user can't manage scripts/schedulers.
            logger.warning(
                "Could not set up walled-garden self-healing scheduler on router %s",
                router.id,
                exc_info=True,
            )
    return updated_profiles, allowed_hosts


def _captive_portal_r2_key(router: Router, remote_name: str) -> str:
    return f"{CAPTIVE_PORTAL_R2_PREFIX}/{router.id}/{remote_name}"


def _portal_file_content_type(path: Path) -> str:
    return {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".ogg": "video/ogg",
        ".txt": "text/plain; charset=utf-8",
    }.get(path.suffix.lower(), "application/octet-stream")


def _portal_template_files(template_dir: Path, router: Router) -> list[tuple[str, bytes, Path]]:
    """Return (remote_name, rendered_content, source_path) for every file to deploy."""
    files: list[tuple[str, bytes, Path]] = []
    for path in sorted(template_dir.rglob("*")):
        if not path.is_file():
            continue
        relative_path = path.relative_to(template_dir).as_posix()
        if path.suffix.lower() == ".md":
            continue
        if relative_path == "index.html":
            remote_names = ["index.html", "login.html"]
        elif relative_path == "login.html" and not (template_dir / "index.html").exists():
            remote_names = ["login.html", "index.html"]
        else:
            remote_names = [relative_path]
        content = _render_portal_file(path, router)
        for remote_name in remote_names:
            files.append((remote_name, content, path))
    return files


_PORTAL_FILE_PRIORITY = {
    "login.html": 0,
    "index.html": 1,
    "md5.js": 2,
    "portal.css": 3,
    "alogin.html": 4,
    "error.html": 5,
    "status.html": 6,
    "logout.html": 7,
    "redirect.html": 8,
    "rlogin.html": 9,
    "errors.txt": 10,
}


def _ordered_portal_files(files: dict[str, str]) -> list[tuple[str, str]]:
    return sorted(
        files.items(),
        key=lambda item: (_PORTAL_FILE_PRIORITY.get(item[0], 100), item[0]),
    )


def _essential_portal_files(template: str) -> set[str]:
    required = {"login.html", "index.html", "alogin.html", "error.html"}
    if template in {"renault", "adsmob", "offline", "classic", "modern", "blue_modern", "brown_cards"}:
        required.add("md5.js")
    return required


def portal_deployment_file(
    session: Session,
    router_name: str,
    remote_name: str,
) -> tuple[bytes, str] | None:
    router = find_router_by_name(session, router_name)
    if not router:
        return None
    captive = session.exec(
        select(CaptivePortal).where(CaptivePortal.router_id == router.id)
    ).first()
    template = captive.portal_template if captive else "renault"
    template_dir = PORTAL_ROOT / template
    safe_name = Path(remote_name).as_posix().lstrip("/")
    if safe_name.startswith("../") or "/../" in safe_name:
        return None
    source_name = "login.html" if safe_name == "index.html" and not (template_dir / "index.html").exists() else safe_name
    source_path = template_dir / source_name
    if not source_path.is_file() or source_path.suffix.lower() == ".md":
        return None
    try:
        source_path.resolve().relative_to(template_dir.resolve())
    except ValueError:
        return None
    return _render_portal_file(source_path, router), _portal_file_content_type(source_path)


def _portal_backend_file_url(router: Router, remote_name: str) -> str:
    return (
        f"{_portal_api_base()}/portal/{quote(router_public_id(router), safe='')}"
        f"/deployment-files/{quote(remote_name, safe='/')}"
    )


def _validate_portal_template(template_dir: Path, template: str) -> str | None:
    required = {"login.html", "alogin.html", "error.html", "logout.html", "status.html"}
    if template in {"renault", "adsmob", "offline", "classic", "modern", "blue_modern", "brown_cards"}:
        required.update({"md5.js", "portal.css"})
    missing = sorted(name for name in required if not (template_dir / name).is_file())
    if missing:
        return f"Portal template '{template}' is missing required files: {', '.join(missing)}"
    return None


def push_captive_portal_to_r2(
    router: Router,
    template: str = "renault",
    expires_in: int = 3600,
) -> dict[str, Any]:
    """Render this router's captive portal template and upload it to Cloudflare R2."""
    template_dir = PORTAL_ROOT / template
    if not template_dir.exists():
        return {"success": False, "files": {}, "error": f"Portal template '{template}' not found"}
    validation_error = _validate_portal_template(template_dir, template)
    if validation_error:
        return {"success": False, "files": {}, "error": validation_error}

    files: dict[str, str] = {}
    try:
        for remote_name, content, source_path in _portal_template_files(template_dir, router):
            key = _captive_portal_r2_key(router, remote_name)
            upload_bytes(key, content, content_type=_portal_file_content_type(source_path))
            files[remote_name] = object_url(key, expires_in=expires_in)
    except STORAGE_ERRORS as exc:
        return {"success": False, "files": files, "error": f"R2 upload failed: {exc}"}

    return {"success": True, "files": files, "error": None}


# ── Deploy-via-fetch helpers ───────────────────────────────────────────────


def _ensure_router_directory(ros: RouterApiSession, directory: str) -> bool:
    """
    Confirm *directory* exists on the router, creating it when absent.

    Returns True when the directory is ready to receive files.  The ``/file
    add`` call is a no-op on RouterOS if the directory already exists (it
    raises a harmless error that we catch and verify by listing instead).
    """
    try:
        ros.api.get_resource("/file").add(name=directory, type="directory")
        return True
    except Exception:
        pass
    try:
        entries = ros.api.get_resource("/file").get(name=directory)
        if entries and str(entries[0].get("type", "")).lower() in ("directory", "dir"):
            return True
    except Exception:
        pass
    return False


def _is_permission_denied(error: str) -> bool:
    """Return True when *error* describes a filesystem permission problem."""
    low = error.lower()
    return any(kw in low for kw in ("permission", "denied", "not permitted", "cannot write"))


def _verify_router_files(
    ros: RouterApiSession,
    directory: str,
    filenames: list[str],
) -> tuple[set[str], set[str]]:
    """
    Read ``/file print`` and return *(verified, unverified)* sets.

    A file is verified when it appears under ``<directory>/`` with ``size > 0``.
    Returns the full *filenames* set as unverified if the API call fails.
    """
    prefix = f"{directory}/"
    present: dict[str, int] = {}
    try:
        for entry in ros.api.get_resource("/file").get():
            name = str(entry.get("name", "")).replace("\\", "/")
            if name.startswith(prefix):
                basename = name[len(prefix):]
                if "/" not in basename:  # skip nested paths
                    present[basename] = int(entry.get("size", 0) or 0)
    except Exception:
        return set(), set(filenames)

    verified = {fn for fn in filenames if present.get(fn, 0) > 0}
    return verified, set(filenames) - verified


def deploy_captive_portal_via_fetch(
    router: Router,
    template: str = "renault",
    session: Session | None = None,
) -> dict[str, Any]:
    """
    Push the rendered captive portal to R2, then have the router pull each
    file down with ``/tool fetch`` over its API connection and point the
    hotspot profile(s) at the resulting directory.

    Deployment procedure
    --------------------
    1. Upload template files to R2 with 2-hour presigned URLs.
    2. Verify the target directory exists on the router; create it if absent.
       If it cannot be created, fall back immediately to ``hotspot/``.
    3. Fetch every file: backend URL first (short, never expires, all RouterOS
       versions), R2 presigned as fallback.
    4. If any fetch fails with a permission error, switch to ``hotspot/`` and
       re-fetch everything there from scratch.
    5. After fetching, verify each file with ``/file print`` (size > 0).
    6. Re-fetch any missing or zero-byte files once.
    7. Update the hotspot server profile(s) to point at the deployed directory.
    """
    upload_result = push_captive_portal_to_r2(router, template, expires_in=7200)
    if not upload_result["success"]:
        return {
            "success": False,
            "fetched_files": [],
            "deployed_directory": None,
            "updated_profiles": [],
            "error": upload_result["error"],
            "diagnostics": {},
        }

    router_directory = _router_directory_name(router.name)
    items = _ordered_portal_files(upload_result["files"])
    FETCH_SOCKET_TIMEOUT = 60.0

    fetched_files: list[str] = []
    fetch_errors: list[str] = []
    r2_fallback_files: list[str] = []   # files served from R2 instead of backend
    retry_counts: dict[str, int] = {}
    target_directory = router_directory
    used_hotspot_fallback = False

    # ── Inner fetch loop (runs once per directory — custom, then hotspot/) ──
    def _run_fetch_loop(ros: RouterApiSession, batch: list[tuple[str, str]], target: str) -> None:
        for remote_name, r2_url in batch:
            backend_url = _portal_backend_file_url(router, remote_name)
            urls = [backend_url, r2_url]
            errors: list[str] = []
            fetched = False

            for source_index, url in enumerate(urls):
                for attempt in range(1, 3):
                    retry_counts[remote_name] = retry_counts.get(remote_name, 0) + 1
                    try:
                        replies = ros.api.get_resource("/tool").call("fetch", {
                            "url": url,
                            "dst-path": f"{target}/{remote_name}",
                            "mode": "https",
                            "check-certificate": "no",
                        })
                        status = replies[-1].get("status") if replies else None
                        if status and status != "finished":
                            raise RuntimeError(str(status))
                        fetched_files.append(remote_name)
                        if source_index == 1:
                            r2_fallback_files.append(remote_name)
                        fetched = True
                        break
                    except OSError as exc:
                        errors.append(f"src{source_index + 1}/att{attempt}: {exc}")
                        if attempt < 2:
                            try:
                                ros.reconnect()
                                _ensure_router_directory(ros, target)
                            except Exception as reconnect_exc:
                                errors.append(f"reconnect: {reconnect_exc}")
                                break
                    except Exception as exc:
                        errors.append(f"src{source_index + 1}/att{attempt}: {exc}")
                        break
                if fetched:
                    break

            if not fetched:
                fetch_errors.append(f"{remote_name}: {'; '.join(errors)}")

    with RouterApiSession(router, socket_timeout=FETCH_SOCKET_TIMEOUT) as ros:

        # ── 1. Verify / create target directory ────────────────────────
        if not _ensure_router_directory(ros, target_directory):
            logger.warning(
                "Could not create /%s on %s — falling back to hotspot/",
                target_directory, router.name,
            )
            target_directory = "hotspot"
            used_hotspot_fallback = True
            _ensure_router_directory(ros, "hotspot")

        # ── 2. Fetch all files ─────────────────────────────────────────
        _run_fetch_loop(ros, items, target_directory)

        # ── 3. Fall back to hotspot/ on permission errors ──────────────
        if (
            not used_hotspot_fallback
            and target_directory != "hotspot"
            and any(_is_permission_denied(e) for e in fetch_errors)
        ):
            logger.info(
                "Permission denied writing to /%s on %s — retrying in hotspot/",
                target_directory, router.name,
            )
            used_hotspot_fallback = True
            target_directory = "hotspot"
            _ensure_router_directory(ros, "hotspot")
            fetched_files.clear()
            fetch_errors.clear()
            r2_fallback_files.clear()
            retry_counts.clear()
            _run_fetch_loop(ros, items, "hotspot")

        # ── 4. Verify each file exists with size > 0 ───────────────────
        _, unverified = _verify_router_files(ros, target_directory, list(set(fetched_files)))

        # ── 5. Re-fetch missing or zero-byte files once ────────────────
        if unverified:
            logger.info(
                "Re-fetching %d unverified file(s) on %s: %s",
                len(unverified), router.name, ", ".join(sorted(unverified)),
            )
            retry_batch = [(name, url) for name, url in items if name in unverified]
            for fn in unverified:
                while fn in fetched_files:
                    fetched_files.remove(fn)
            _run_fetch_loop(ros, retry_batch, target_directory)
            _, still_missing = _verify_router_files(ros, target_directory, list(unverified))
            for fn in still_missing:
                fetch_errors.append(f"{fn}: absent or zero-byte after re-fetch")

    # ── 6. Require at least one file to have been fetched ─────────────
    if not fetched_files:
        return {
            "success": False,
            "fetched_files": [],
            "deployed_directory": target_directory,
            "updated_profiles": [],
            "error": "; ".join(fetch_errors) or "No captive portal files were fetched.",
            "diagnostics": {
                "fetch_errors": "; ".join(fetch_errors),
                "used_hotspot_fallback": str(used_hotspot_fallback),
            },
        }

    # ── 7. Update hotspot profile(s) ──────────────────────────────────
    try:
        updated_profiles, allowed_hosts = _set_hotspot_portal_configuration(
            router, target_directory, template, session,
        )
    except Exception as exc:
        return {
            "success": False,
            "fetched_files": fetched_files,
            "deployed_directory": target_directory,
            "updated_profiles": [],
            "error": f"Files fetched but updating the hotspot profile failed: {exc}",
            "diagnostics": {
                "fetch_errors": "; ".join(fetch_errors) if fetch_errors else None,
                "used_hotspot_fallback": str(used_hotspot_fallback),
            },
        }

    diagnostics: dict[str, Any] = {
        "walled_garden_hosts": ",".join(allowed_hosts) or "none",
        "walled_garden_script": _WALLED_GARDEN_SYNC_NAME,
        "updated_hotspot_profiles": ",".join(updated_profiles) or "none",
        "fetch_attempts": ",".join(f"{n}:{c}" for n, c in retry_counts.items()),
        "used_hotspot_fallback": str(used_hotspot_fallback),
    }
    if r2_fallback_files:
        diagnostics["r2_fallback_files"] = ",".join(r2_fallback_files)
    if fetch_errors:
        diagnostics["fetch_errors"] = "; ".join(fetch_errors)

    if not updated_profiles:
        return {
            "success": False,
            "fetched_files": fetched_files,
            "deployed_directory": target_directory,
            "updated_profiles": [],
            "error": (
                f"Files fetched into /{target_directory}, but no active hotspot server "
                "profile was found to update its html-directory."
            ),
            "diagnostics": diagnostics,
        }

    missing_essential = sorted(_essential_portal_files(template) - set(fetched_files))
    if missing_essential:
        diagnostics["missing_essential_files"] = ",".join(missing_essential)

    return {
        "success": not missing_essential,
        "fetched_files": fetched_files,
        "deployed_directory": target_directory,
        "updated_profiles": updated_profiles,
        "error": (
            f"Essential portal files could not be deployed: {', '.join(missing_essential)}"
            if missing_essential
            else None
        ),
        "diagnostics": diagnostics,
    }


def push_captive_files_to_mikrotik(
    router: Router,
    template: str = "renault",
    ftp_username: str | None = None,
    ftp_password: str | None = None,
    ftp_port: int | None = None,
    session: Session | None = None,
) -> dict[str, Any]:
    # CHR-tunneled routers reach the backend via a NAT rule that maps only the
    # RouterOS API port (8728) and Winbox port through the CHR.  FTP port 21 is
    # not forwarded, so plaintext FTP will never connect.  Tell the caller to
    # use the /tool-fetch deploy path instead.
    if router.nat_port is not None and not ftp_port:
        return {
            "success": False,
            "pushed_files": [],
            "deployed_directory": None,
            "updated_profiles": [],
            "error": (
                "This router connects through the Tresa CHR tunnel. "
                "FTP port 21 is not forwarded through the tunnel — use 'Deploy via /tool fetch' "
                "instead, which uses the existing API connection."
            ),
            "diagnostics": {"nat_port": str(router.nat_port), "router_host": str(router.host)},
        }

    template_dir = PORTAL_ROOT / template
    if not template_dir.exists():
        return {
            "success": False,
            "pushed_files": [],
            "deployed_directory": None,
            "updated_profiles": [],
            "error": f"Portal template '{template}' not found",
            "diagnostics": {},
        }
    validation_error = _validate_portal_template(template_dir, template)
    if validation_error:
        return {
            "success": False,
            "pushed_files": [],
            "deployed_directory": None,
            "updated_profiles": [],
            "error": validation_error,
            "diagnostics": {},
        }

    configured_ftp_user = os.getenv("ROUTER_FTP_USER")
    configured_ftp_password = os.getenv("ROUTER_FTP_PASSWORD")
    resolved_ftp_port = ftp_port or int(os.getenv("ROUTER_FTP_PORT", "21"))
    ftp_user = ftp_username or configured_ftp_user or router.username
    resolved_ftp_password = ftp_password or configured_ftp_password or router.password
    credential_source = "deployment form" if ftp_username else "environment" if configured_ftp_user else "saved router credentials"
    router_directory = _router_directory_name(router.name)
    deployed_directory = router_directory
    pushed_files: list[str] = []
    updated_profiles: list[str] = []
    allowed_hosts: list[str] = []
    diagnostics = _ftp_router_diagnostics(router)
    diagnostics.update({
        "ftp_host": router.host,
        "ftp_port": str(resolved_ftp_port),
        "ftp_username": ftp_user,
        "credential_source": credential_source,
        "remote_directory": deployed_directory,
    })

    try:
        try:
            with router_connection(router) as api:
                ftp_services = api.get_resource("/ip/service").get(name="ftp")
                service_id = _first_resource_id(ftp_services)
                if service_id:
                    api.get_resource("/ip/service").set(id=service_id, disabled="no")
        except Exception:
            pass

        with ftplib.FTP() as ftp:
            ftp.connect(router.host, resolved_ftp_port, timeout=15)
            ftp.login(ftp_user, resolved_ftp_password)
            ftp.set_pasv(True)
            try:
                ftp.cwd(router_directory)
            except ftplib.error_perm as cwd_error:
                if not str(cwd_error).startswith("550"):
                    raise
                try:
                    ftp.mkd(router_directory)
                    ftp.cwd(router_directory)
                except ftplib.error_perm as mkdir_error:
                    raise ftplib.error_perm(
                        f"{mkdir_error}. FTP login succeeded, but user '{ftp_user}' cannot access or create "
                        f"'/{router_directory}'."
                    ) from mkdir_error

            directories = sorted(
                (path.relative_to(template_dir) for path in template_dir.rglob("*") if path.is_dir()),
                key=lambda path: (len(path.parts), path.as_posix()),
            )
            for relative_dir in directories:
                try:
                    ftp.mkd(relative_dir.as_posix())
                except ftplib.error_perm as mkdir_error:
                    if not str(mkdir_error).startswith("550"):
                        raise

            for path in sorted(template_dir.rglob("*")):
                if not path.is_file():
                    continue
                relative_path = path.relative_to(template_dir).as_posix()
                if path.suffix.lower() == ".md":
                    continue
                if relative_path == "index.html":
                    remote_names = ["index.html", "login.html"]
                elif relative_path == "login.html" and not (template_dir / "index.html").exists():
                    remote_names = ["login.html", "index.html"]
                else:
                    remote_names = [relative_path]
                for remote_name in remote_names:
                    ftp.storbinary(f"STOR {remote_name}", io.BytesIO(_render_portal_file(path, router)))
                    pushed_files.append(remote_name)

        updated_profiles, allowed_hosts = _set_hotspot_portal_configuration(
            router,
            deployed_directory,
            template,
            session,
        )
        diagnostics["updated_hotspot_profiles"] = ",".join(updated_profiles) or "none"
        diagnostics["walled_garden_hosts"] = ",".join(allowed_hosts) or "none"
        diagnostics["walled_garden_script"] = _WALLED_GARDEN_SYNC_NAME
        if not updated_profiles:
            return {
                "success": False,
                "pushed_files": pushed_files,
                "deployed_directory": deployed_directory,
                "updated_profiles": [],
                "error": (
                    f"Files were uploaded to /{deployed_directory}, but no active hotspot server profile "
                    "was found to update its html-directory."
                ),
                "diagnostics": diagnostics,
            }

        return {
            "success": True,
            "pushed_files": pushed_files,
            "deployed_directory": deployed_directory,
            "updated_profiles": updated_profiles,
            "error": None,
            "diagnostics": diagnostics,
        }
    except ftplib.error_perm as exc:
        error = str(exc)
        if "530" in error:
            policies = diagnostics.get("router_user_policies", "unknown")
            available_from = diagnostics.get("service_available_from", "unknown")
            if "ftp" in {item.strip().lstrip("!") for item in policies.split(",")}:
                error = (
                    f"RouterOS rejected the username/password for FTP user '{ftp_user}' using {credential_source}. "
                    "The FTP service is enabled and this user's group already has the ftp policy. "
                    "Re-enter the current RouterOS password in FTP Credentials. If that still fails, verify that "
                    f"{router.host}:{resolved_ftp_port} forwards to the same MikroTik as API port {router.port}. "
                    f"FTP Available From: {available_from or 'unrestricted'}."
                )
            else:
                error = (
                    f"RouterOS rejected FTP login for '{ftp_user}' using {credential_source}. "
                    f"The user's group does not include the ftp policy. Current policies: {policies}. "
                    f"FTP Available From: {available_from or 'unrestricted'}."
                )
        return {
            "success": False,
            "pushed_files": pushed_files,
            "deployed_directory": deployed_directory,
            "updated_profiles": updated_profiles,
            "error": error,
            "diagnostics": diagnostics,
        }
    except (ConnectionRefusedError, TimeoutError, OSError) as exc:
        available_from = diagnostics.get("service_available_from", "unknown")
        error = (
            f"Could not reach FTP at {router.host}:{resolved_ftp_port}: {exc}. "
            f"RouterOS FTP Available From is {available_from}; it must include the backend/tunnel source IP."
        )
        return {
            "success": False,
            "pushed_files": pushed_files,
            "deployed_directory": deployed_directory,
            "updated_profiles": updated_profiles,
            "error": error,
            "diagnostics": diagnostics,
        }
    except Exception as exc:
        return {
            "success": False,
            "pushed_files": pushed_files,
            "deployed_directory": deployed_directory,
            "updated_profiles": updated_profiles,
            "error": str(exc),
            "diagnostics": diagnostics,
        }
