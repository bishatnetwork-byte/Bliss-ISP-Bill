import ftplib
import io
import os
import re
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from sqlmodel import Session, select

from app.models.captive_portal import CaptivePortal
from app.models.branch import Branch
from app.models.notification import Notification
from app.models.router import Router
from app.models.staff import Staff
from app.models.user import User
from app.models.voucher_purchase import VoucherPurchase
from app.models.wallet import Wallet
from app.services import wallet as wallet_svc
from app.services.routers.Packages import get_router_packages
from app.services.routers.routeros import router_connection
from app.services.storage import STORAGE_ERRORS, object_url, upload_bytes


PORTAL_ROOT = Path("app/portal")
CAPTIVE_PORTAL_R2_PREFIX = "captive-portal"
DEFAULT_CAPTIVE_TITLE = "Renault WIFI"
DEFAULT_CAPTIVE_DESCRIPTION = "High-speed internet access portal"


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
        "logo_url": captive.logo_url,
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


def generate_voucher_code(router_name: str) -> str:
    prefix = normalize_router_name(router_name)[:3] or "RTR"
    return f"{prefix}-{secrets.token_hex(3).upper()}"


def _hotspot_limit_to_routeros(limit: str) -> str | None:
    normalized = limit.strip().lower().replace(" ", "")
    if not normalized:
        return None
    if normalized.endswith("hours"):
        return f"{normalized.removesuffix('hours')}h"
    if normalized.endswith("hour"):
        return f"{normalized.removesuffix('hour')}h"
    if normalized.endswith("days"):
        return f"{normalized.removesuffix('days')}d"
    if normalized.endswith("day"):
        return f"{normalized.removesuffix('day')}d"
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


def record_portal_payment(
    session: Session,
    router_name: str,
    phone_number: str,
    package_id: int,
    payment_reference: str | None = None,
) -> tuple[Wallet, VoucherPurchase]:
    router = find_router_by_name(session, router_name)
    if not router:
        raise ValueError("Router not found for this portal")

    package = find_package(session, router.name, package_id)
    if not package:
        raise ValueError("Package not found for this router")

    wallet = get_or_create_wallet(session, router.name, phone_number)
    amount = int(package["total"])

    voucher = VoucherPurchase(
        wallet_id=wallet.id,
        router_name=wallet.router_name,
        phone_number=wallet.phone_number,
        voucher_code=generate_voucher_code(router.name),
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

    # The customer has paid via the captive portal — collect that amount into
    # the branch's wallet now, regardless of whether MikroTik provisioning
    # below succeeds, since the payment itself has already been taken.
    branch = session.get(Branch, router.branch_id)
    if branch:
        branch_wallet = wallet_svc.ensure_wallet(session, branch.id)
        wallet_svc.deposit(
            session=session,
            wallet_id=branch_wallet.id,
            amount=amount,
            user_id=branch.user_id,
            reference=payment_reference or voucher.voucher_code,
        )

    try:
        _upsert_hotspot_voucher(router, voucher, package)
        voucher.status = "PROVISIONED"
        session.add(voucher)
        session.commit()
        session.refresh(voucher)
    except Exception as exc:
        voucher.status = "ROUTER_SYNC_FAILED"
        session.add(voucher)
        session.commit()
        raise ValueError(f"Payment recorded but MikroTik voucher sync failed: {exc}") from exc

    return wallet, voucher


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
    return os.getenv("PORTAL_PUBLIC_API_URL", "https://renult.vercel.app").rstrip("/")


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


def _walled_garden_host_patterns(host: str) -> list[str]:
    """Exact host plus a `*.host` wildcard so subdomains are allowed too."""
    host = host.strip().lower()
    if not host:
        return []
    return [host, f"*.{host}"]


def _walled_garden_hosts_for_template(template: str) -> list[str]:
    api_host = re.sub(r"^https?://", "", _portal_api_base()).split("/", 1)[0].split(":", 1)[0]
    hosts: list[str] = []
    for host in (api_host, *_TEMPLATE_EXTRA_WALLED_GARDEN_HOSTS.get(template, [])):
        for pattern in _walled_garden_host_patterns(host):
            if pattern not in hosts:
                hosts.append(pattern)
    return hosts


def _set_hotspot_portal_configuration(router: Router, directory: str, template: str = "renault") -> tuple[list[str], list[str]]:
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
        existing_hosts = {
            str(item.get("dst-host", "")).strip().lower()
            for item in walled_garden.get()
            if item.get("dst-host")
        }
        for host_pattern in _walled_garden_hosts_for_template(template):
            if host_pattern.lower() not in existing_hosts:
                walled_garden.add(action="allow", **{"dst-host": host_pattern})
                existing_hosts.add(host_pattern.lower())
            allowed_hosts.append(host_pattern)
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
        ".txt": "text/plain; charset=utf-8",
    }.get(path.suffix.lower(), "application/octet-stream")


def _portal_template_files(template_dir: Path, router: Router) -> list[tuple[str, bytes, Path]]:
    """Return (remote_name, rendered_content, source_path) for every file to deploy."""
    files: list[tuple[str, bytes, Path]] = []
    for path in sorted(template_dir.rglob("*")):
        if not path.is_file():
            continue
        relative_path = path.relative_to(template_dir).as_posix()
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


def push_captive_portal_to_r2(
    router: Router,
    template: str = "renault",
    expires_in: int = 3600,
) -> dict[str, Any]:
    """Render this router's captive portal template and upload it to Cloudflare R2."""
    template_dir = PORTAL_ROOT / template
    if not template_dir.exists():
        return {"success": False, "files": {}, "error": f"Portal template '{template}' not found"}

    files: dict[str, str] = {}
    try:
        for remote_name, content, source_path in _portal_template_files(template_dir, router):
            key = _captive_portal_r2_key(router, remote_name)
            upload_bytes(key, content, content_type=_portal_file_content_type(source_path))
            files[remote_name] = object_url(key, expires_in=expires_in)
    except STORAGE_ERRORS as exc:
        return {"success": False, "files": files, "error": f"R2 upload failed: {exc}"}

    return {"success": True, "files": files, "error": None}


def deploy_captive_portal_via_fetch(router: Router, template: str = "renault") -> dict[str, Any]:
    """
    Push the rendered captive portal to R2, then have the router pull each file
    down with `/tool fetch` over its API connection and point the hotspot
    profile(s) at the resulting directory.
    """
    upload_result = push_captive_portal_to_r2(router, template, expires_in=3600)
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
    fetched_files: list[str] = []
    fetch_errors: list[str] = []
    items = list(upload_result["files"].items())

    # `/tool fetch` can occasionally run past the routeros_api default 15s
    # socket timeout (slow DNS/TLS to R2 from the router's WAN link). A
    # timeout on one file leaves the underlying socket closed but still
    # referenced by this connection, so every later call on it fails with
    # "[Errno 9] Bad file descriptor". Give fetches more headroom and open a
    # fresh connection after any per-file error so one bad file can't take
    # down the rest of the deploy.
    FETCH_SOCKET_TIMEOUT = 60.0

    index = 0
    while index < len(items):
        try:
            with router_connection(router, socket_timeout=FETCH_SOCKET_TIMEOUT) as api:
                try:
                    api.get_resource("/file").add(name=router_directory, type="directory")
                except Exception:
                    pass  # directory already exists, or RouterOS creates it on fetch

                tool_resource = api.get_resource("/tool")
                while index < len(items):
                    remote_name, url = items[index]
                    index += 1
                    try:
                        replies = tool_resource.call("fetch", {
                            "url": url,
                            "dst-path": f"{router_directory}/{remote_name}",
                            "mode": "https",
                        })
                        status = replies[-1].get("status") if replies else None
                        if status and status != "finished":
                            fetch_errors.append(f"{remote_name}: {status}")
                        else:
                            fetched_files.append(remote_name)
                    except Exception as exc:
                        fetch_errors.append(f"{remote_name}: {exc}")
                        break  # reconnect before fetching the remaining files
        except Exception as exc:
            fetch_errors.append(f"connection: {exc}")
            break

    if not fetched_files:
        return {
            "success": False,
            "fetched_files": fetched_files,
            "deployed_directory": router_directory,
            "updated_profiles": [],
            "error": "; ".join(fetch_errors) or "No captive portal files were fetched.",
            "diagnostics": {"fetch_errors": "; ".join(fetch_errors)} if fetch_errors else {},
        }

    try:
        updated_profiles, allowed_hosts = _set_hotspot_portal_configuration(router, router_directory, template)
    except Exception as exc:
        return {
            "success": False,
            "fetched_files": fetched_files,
            "deployed_directory": router_directory,
            "updated_profiles": [],
            "error": f"Files were fetched, but updating the hotspot profile failed: {exc}",
            "diagnostics": {"fetch_errors": "; ".join(fetch_errors)} if fetch_errors else {},
        }

    diagnostics = {
        "walled_garden_hosts": ",".join(allowed_hosts) or "none",
        "updated_hotspot_profiles": ",".join(updated_profiles) or "none",
    }
    if fetch_errors:
        diagnostics["fetch_errors"] = "; ".join(fetch_errors)

    if not updated_profiles:
        return {
            "success": False,
            "fetched_files": fetched_files,
            "deployed_directory": router_directory,
            "updated_profiles": [],
            "error": (
                f"Files were fetched into /{router_directory}, but no active hotspot server profile "
                "was found to update its html-directory."
            ),
            "diagnostics": diagnostics,
        }

    return {
        "success": not fetch_errors,
        "fetched_files": fetched_files,
        "deployed_directory": router_directory,
        "updated_profiles": updated_profiles,
        "error": "; ".join(fetch_errors) if fetch_errors else None,
        "diagnostics": diagnostics,
    }


def push_captive_files_to_mikrotik(
    router: Router,
    template: str = "renault",
    ftp_username: str | None = None,
    ftp_password: str | None = None,
    ftp_port: int | None = None,
) -> dict[str, Any]:
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
                if relative_path == "index.html":
                    remote_names = ["index.html", "login.html"]
                elif relative_path == "login.html" and not (template_dir / "index.html").exists():
                    remote_names = ["login.html", "index.html"]
                else:
                    remote_names = [relative_path]
                for remote_name in remote_names:
                    ftp.storbinary(f"STOR {remote_name}", io.BytesIO(_render_portal_file(path, router)))
                    pushed_files.append(remote_name)

        updated_profiles, allowed_hosts = _set_hotspot_portal_configuration(router, deployed_directory, template)
        diagnostics["updated_hotspot_profiles"] = ",".join(updated_profiles) or "none"
        diagnostics["walled_garden_hosts"] = ",".join(allowed_hosts) or "none"
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
