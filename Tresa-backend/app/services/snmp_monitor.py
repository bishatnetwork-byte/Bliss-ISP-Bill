import socket
import threading
import time
from datetime import datetime
from html import escape
from typing import Iterator

from sqlmodel import Session, select

from app.core.config import settings
from app.db.session import engine
from app.models.branch import Branch
from app.models.branch_wallet import SmsWallet
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.router import Router
from app.models.user import User
from app.services.email import send_email
from app.services.messaging import normalize_sms_phone, send_sms, sms_was_accepted
from app.services import sms_wallet as sms_wallet_svc
from app.services.telegram import send_branch_event

SYS_UPTIME_OID = (1, 3, 6, 1, 2, 1, 1, 3, 0)


def _length(value: int) -> bytes:
    if value < 128:
        return bytes([value])
    encoded = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(encoded)]) + encoded


def _tlv(tag: int, value: bytes) -> bytes:
    return bytes([tag]) + _length(len(value)) + value


def _integer(value: int) -> bytes:
    encoded = value.to_bytes(max(1, (value.bit_length() + 8) // 8), "big", signed=True)
    return _tlv(0x02, encoded)


def _oid(parts: tuple[int, ...]) -> bytes:
    encoded = bytearray([parts[0] * 40 + parts[1]])
    for part in parts[2:]:
        stack = [part & 0x7F]
        part >>= 7
        while part:
            stack.append(0x80 | (part & 0x7F))
            part >>= 7
        encoded.extend(reversed(stack))
    return _tlv(0x06, bytes(encoded))


def _snmp_request(community: str, request_id: int) -> bytes:
    varbind = _tlv(0x30, _oid(SYS_UPTIME_OID) + _tlv(0x05, b""))
    varbinds = _tlv(0x30, varbind)
    pdu = _tlv(0xA0, _integer(request_id) + _integer(0) + _integer(0) + varbinds)
    return _tlv(0x30, _integer(1) + _tlv(0x04, community.encode()) + pdu)


def _values(payload: bytes, start: int = 0, end: int | None = None) -> Iterator[tuple[int, bytes]]:
    cursor = start
    limit = len(payload) if end is None else end
    while cursor < limit:
        tag = payload[cursor]
        cursor += 1
        first = payload[cursor]
        cursor += 1
        if first & 0x80:
            count = first & 0x7F
            length = int.from_bytes(payload[cursor:cursor + count], "big")
            cursor += count
        else:
            length = first
        value = payload[cursor:cursor + length]
        cursor += length
        yield tag, value


def _find_timeticks(payload: bytes) -> int | None:
    for tag, value in _values(payload):
        if tag == 0x43:
            return int.from_bytes(value, "big")
        if tag in {0x30, 0xA2}:
            found = _find_timeticks(value)
            if found is not None:
                return found
    return None


def poll_snmp_uptime(host: str, port: int | None = None) -> int:
    request_id = int(time.time()) & 0x7FFFFFFF
    packet = _snmp_request(settings.snmp_community, request_id)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
        client.settimeout(settings.snmp_timeout_seconds)
        client.sendto(packet, (host, port or settings.snmp_port))
        response, _ = client.recvfrom(65535)
    ticks = _find_timeticks(response)
    if ticks is None:
        raise RuntimeError("SNMP response did not contain sysUpTime")
    return ticks // 100


def get_or_create_preferences(session: Session, user: User) -> NotificationPreference:
    preferences = session.exec(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    ).first()
    if preferences:
        return preferences
    preferences = NotificationPreference(
        user_id=user.id,
        sms_phone_number=user.phone_number,
    )
    session.add(preferences)
    session.flush()
    return preferences


def _send_status_email(user: User, router: Router, online: bool) -> None:
    state = "back online" if online else "offline"
    color = "#059669" if online else "#dc2626"
    send_email(
        user.email,
        f"{router.name} is {state}",
        (
            f"<div style='font-family:Arial,sans-serif'>"
            f"<h2 style='color:{color}'>{escape(router.name)} is {state}</h2>"
            f"<p>SNMP monitoring detected this status change at "
            f"{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC.</p></div>"
        ),
    )


def _charge_sms(session: Session, branch: Branch, user: User, router: Router) -> bool:
    cost = settings.sms_notification_cost
    reference = f"SNMP-{router.id}-{int(time.time())}"
    charged, _balance = sms_wallet_svc.charge_sms(session, branch.id, user.id, cost, reference)
    return charged


def _can_afford_sms(session: Session, branch: Branch) -> bool:
    wallet = session.exec(select(SmsWallet).where(SmsWallet.branch_id == branch.id)).first()
    return bool(
        wallet
        and not wallet.is_frozen
        and wallet.balance >= settings.sms_notification_cost
    )


def _notify_transition(
    session: Session,
    branch: Branch,
    user: User,
    router: Router,
    online: bool,
) -> None:
    state = "back online" if online else "offline"
    body = (
        f"SNMP monitoring detected that {router.name} is {state}. "
        f"Checked at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC."
    )
    session.add(
        Notification(
            user_id=user.id,
            category="router",
            title=f"{router.name} is {state}",
            body=body,
        )
    )
    send_branch_event(
        session,
        branch.id,
        "router",
        (
            f"<b>Router {state}</b>\n"
            f"Router: {escape(router.name)}\n"
            "Source: SNMP monitoring\n"
            f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC"
        ),
    )
    preferences = get_or_create_preferences(session, user)
    if preferences.email_router_alerts:
        try:
            _send_status_email(user, router, online)
        except Exception:
            pass
    if preferences.sms_router_alerts and preferences.sms_phone_number:
        try:
            phone = normalize_sms_phone(preferences.sms_phone_number)
            if _can_afford_sms(session, branch):
                response = send_sms(f"Renult alert: {router.name} is {state}.", [phone], session)
                if sms_was_accepted(response, phone):
                    _charge_sms(session, branch, user, router)
                else:
                    session.add(
                        Notification(
                            user_id=user.id,
                            category="billing",
                            title="Router SMS was not sent",
                            body=f"No charge was made because the SMS for {router.name} was rejected.",
                        )
                    )
            else:
                session.add(
                    Notification(
                        user_id=user.id,
                        category="billing",
                        title="Router SMS skipped",
                        body=(
                            f"Add at least {settings.sms_notification_cost} UGX to the "
                            f"{branch.name} wallet to receive SMS router alerts."
                        ),
                    )
                )
        except Exception:
            session.add(
                Notification(
                    user_id=user.id,
                    category="billing",
                    title="Router SMS failed",
                    body=f"The SMS for {router.name} failed and your wallet was not charged.",
                )
            )


def poll_router(
    session: Session,
    router: Router,
    *,
    notify_transitions: bool = True,
) -> None:
    previous = router.snmp_status
    checked_at = datetime.utcnow()
    try:
        # Prefer polling the tunnel IP directly (CHR → physical router via PPP interface),
        # so the source is 10.0.0.1 (chr_tunnel_local_address) and matches the community
        # restriction. Falling back to chr_host:nat_port relies on DNAT which does not
        # fire for locally-originated traffic on RouterOS.
        if router.tunnel_ip:
            snmp_host = str(router.tunnel_ip)
            snmp_port = settings.snmp_port
        else:
            snmp_host = router.host
            snmp_port = router.nat_port if router.nat_port else settings.snmp_port
        uptime = poll_snmp_uptime(snmp_host, snmp_port)
        router.snmp_status = "online"
        router.snmp_configured = True
        router.snmp_uptime_seconds = uptime
        router.snmp_error = None
        router.last_seen = checked_at
    except Exception as exc:
        router.snmp_status = "offline"
        router.snmp_uptime_seconds = None
        router.snmp_error = str(exc)[:500]
    router.snmp_checked_at = checked_at
    router.updated_at = checked_at
    session.add(router)

    status_changed = previous in {"online", "offline"} and previous != router.snmp_status
    first_offline_check = previous == "unknown" and router.snmp_status == "offline"
    if notify_transitions and (status_changed or first_offline_check):
        branch = session.get(Branch, router.branch_id)
        user = session.get(User, branch.user_id) if branch else None
        if branch and user:
            _notify_transition(session, branch, user, router, router.snmp_status == "online")
    session.commit()


class SnmpMonitorWorker:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if not settings.snmp_monitor_enabled or (self._thread and self._thread.is_alive()):
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="snmp-monitor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                with Session(engine) as session:
                    router_ids = session.exec(
                        select(Router.id).where(
                            Router.is_active.is_(True),
                            Router.snmp_configured.is_(True),
                        )
                    ).all()
                for router_id in router_ids:
                    if self._stop.is_set():
                        break
                    with Session(engine) as session:
                        router = session.get(Router, router_id)
                        if router:
                            poll_router(session, router)
            except Exception:
                pass
            self._stop.wait(max(10, settings.snmp_poll_interval_seconds))


snmp_monitor_worker = SnmpMonitorWorker()
