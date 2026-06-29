from pathlib import Path
from string import Template
from html import escape

import resend
from fastapi import HTTPException, status

from app.core.config import settings
from app.models.user import User

if settings.resend_key:
    resend.api_key = settings.resend_key

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates" / "emails"


def render_email_template(template_name: str, **context: str) -> str:
    template_path = TEMPLATE_DIR / template_name
    template = Template(template_path.read_text())
    escaped_context = {key: escape(str(value)) for key, value in context.items()}
    return template.safe_substitute(**escaped_context)


def send_email(to_email: str, subject: str, html: str, attachments: list[dict] | None = None) -> None:
    if not settings.resend_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="RESEND_KEY is not configured")
    payload: dict = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if attachments:
        payload["attachments"] = attachments
    resend.Emails.send(payload)


def send_verification_email(email: str, full_name: str, code: str) -> None:
    html = render_email_template(
        "verification.html",
        title="Verify your email",
        preview="Your Renult verification code is ready.",
        full_name=full_name,
        code=code,
    )
    send_email(email, "Verify your Renult account", html)


def send_welcome_email(user: User) -> None:
    html = render_email_template(
        "welcome.html",
        title="Welcome to Renult",
        preview="Your Renult account is ready.",
        full_name=user.full_name,
    )
    send_email(user.email, "Welcome to Renult", html)


def send_password_reset_email(email: str, full_name: str, code: str) -> None:
    html = render_email_template(
        "password_reset.html",
        title="Reset your password",
        preview="Your password reset code is ready.",
        full_name=full_name,
        code=code,
    )
    send_email(email, "Reset your Renult password", html)


def send_withdrawal_code_email(email: str, full_name: str, code: str, amount: int, recipient: str) -> None:
    html = render_email_template(
        "withdrawal_code.html",
        full_name=full_name,
        code=code,
        amount=f"{amount:,}",
        recipient=recipient,
    )
    send_email(email, "Your withdrawal verification code", html)


def send_withdrawal_passcode_reset_email(email: str, full_name: str, code: str) -> None:
    html = render_email_template(
        "withdrawal_passcode_reset.html",
        title="Reset your withdrawal passcode",
        preview="Your withdrawal passcode reset code is ready.",
        full_name=full_name,
        code=code,
    )
    send_email(email, "Reset your Renult withdrawal passcode", html)


def send_withdrawal_receipt_email(
    email: str,
    transaction_id: str,
    recipient_name: str,
    recipient_phone: str,
    provider: str,
    amount: int,
    fee: int,
    net_amount: int,
    created_at: str,
    branch_name: str,
) -> None:
    html = render_email_template(
        "withdrawal_receipt.html",
        transaction_id=transaction_id,
        recipient_name=recipient_name,
        recipient_phone=recipient_phone,
        provider=provider,
        amount=f"{amount:,}",
        fee=f"{fee:,}",
        net_amount=f"{net_amount:,}",
        created_at=created_at,
        branch_name=branch_name,
    )
    send_email(
        email,
        f"Withdrawal receipt {transaction_id}",
        html,
        attachments=[
            {
                "filename": f"withdrawal-receipt-{transaction_id}.html",
                "content": list(html.encode("utf-8")),
                "content_type": "text/html",
            }
        ],
    )


def send_staff_invite_email(email: str, full_name: str, branch_name: str, role: str, password: str) -> None:
    html = render_email_template(
        "staff_invite.html",
        full_name=full_name,
        branch_name=branch_name,
        role=role,
        password=password,
    )
    send_email(email, f"You have been invited to manage {branch_name}", html)
