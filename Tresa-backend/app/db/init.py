import sqlalchemy as sa
from sqlmodel import SQLModel, Session, select

from app.db.session import engine
from app.models import (
    EmailVerification,
    Notification,
    NotificationPreference,
    User,
    Branch,
    CaptivePortal,
    Router,
    RouterAuditLog,
    RouterErrorLog,
    RouterPackage,
    Staff,
    TicketCategory,
    Ticket,
    VoucherPurchase,
    VoucherJob,
    PortalPayment,
    WithdrawalChallenge,
    Wallet,
    WalletTransaction,
    BranchWallet,
    BranchWalletTransaction,
    SmsWallet,
    SmsWalletTransaction,
    PlatformLedgerEntry,
    PlatformSmsTransaction,
    TelegramConnection,
    PortalAd,
    PortalAdEvent,
    PlatformAuditLog,
    PlatformSetting,
    VoucherActivationAudit,
    MessageDraft,
    MessageLog,
    LoginAttempt,
    UserSession,
    UserSubscription,
)


def init_db() -> None:
    _ = (
        EmailVerification,
        Notification,
        NotificationPreference,
        User,
        Branch,
        CaptivePortal,
        Router,
        RouterAuditLog,
        RouterErrorLog,
        RouterPackage,
        Staff,
        TicketCategory,
        Ticket,
        VoucherPurchase,
        VoucherJob,
        PortalPayment,
        WithdrawalChallenge,
        Wallet,
        WalletTransaction,
        BranchWallet,
        BranchWalletTransaction,
        SmsWallet,
        SmsWalletTransaction,
        PlatformLedgerEntry,
        PlatformSmsTransaction,
        TelegramConnection,
        PortalAd,
        PortalAdEvent,
        PlatformAuditLog,
        PlatformSetting,
        VoucherActivationAudit,
        MessageDraft,
        MessageLog,
        LoginAttempt,
        UserSession,
        UserSubscription,
    )
    SQLModel.metadata.create_all(engine)
    _ensure_staff_columns()
    _ensure_user_platform_columns()
    _ensure_user_admin_columns()
    _ensure_router_columns()
    _ensure_notification_preference_columns()
    _ensure_voucher_purchase_columns()
    _ensure_portal_ad_columns()
    _ensure_branch_wallet_columns()
    _ensure_branch_wallet_transaction_columns()
    _ensure_sms_wallet_transaction_columns()
    _ensure_platform_sms_transaction_columns()
    _ensure_telegram_connection_columns()
    _ensure_captive_portal_columns()
    _bootstrap_platform_admins()

    # Seed ticket categories
    with Session(engine) as session:
        session.exec(
            sa.delete(Notification).where(
                Notification.title == "CHR concentrator is unreachable"
            )
        )
        default_categories = [
            ("Network Issues", "Tickets related to internet connection, latency, or routers."),
            ("Billing & Payment", "Issues regarding invoices, receipts, and subscriptions."),
            ("Hardware Fault", "Router failure, cabling issues, power supply issues, etc."),
            ("Software Configuration", "Mikrotik firmware, firewall configurations, hotspot setup, etc."),
            ("General Request", "Inquiries or miscellaneous questions about the services.")
        ]
        for name, desc in default_categories:
            existing = session.exec(select(TicketCategory).where(TicketCategory.name == name)).first()
            if not existing:
                category = TicketCategory(name=name, description=desc)
                session.add(category)
        session.commit()


def _ensure_staff_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("staff"):
        return
    columns = {column["name"] for column in inspector.get_columns("staff")}
    statements = []
    if "user_id" not in columns:
        statements.append("ALTER TABLE staff ADD COLUMN user_id UUID")
    if "permissions" not in columns:
        statements.append("ALTER TABLE staff ADD COLUMN permissions VARCHAR DEFAULT 'dashboard,routers,sales,vouchers' NOT NULL")
    if "share_percentage" not in columns:
        statements.append("ALTER TABLE staff ADD COLUMN share_percentage FLOAT DEFAULT 0 NOT NULL")
    if "is_active" not in columns:
        statements.append("ALTER TABLE staff ADD COLUMN is_active BOOLEAN DEFAULT TRUE NOT NULL")
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(sa.text(statement))


def _ensure_user_platform_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("user"):
        return
    columns = {column["name"] for column in inspector.get_columns("user")}
    column_types = {
        "is_active": "BOOLEAN DEFAULT TRUE NOT NULL",
        "allowed_sections": "TEXT",
        "platform_role": "VARCHAR",
        "platform_permissions": "TEXT",
        "platform_fee_share_percentage": "FLOAT DEFAULT 0 NOT NULL",
        "account_subdomain": "VARCHAR",
        "subdomain_enabled": "BOOLEAN DEFAULT FALSE NOT NULL",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f'ALTER TABLE "user" ADD COLUMN {name} {sql_type}'))
        conn.execute(sa.text(
            'CREATE UNIQUE INDEX IF NOT EXISTS ix_user_account_subdomain '
            'ON "user" (account_subdomain) WHERE account_subdomain IS NOT NULL'
        ))


def _ensure_user_admin_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("user"):
        return
    columns = {column["name"] for column in inspector.get_columns("user")}
    column_types = {
        "force_password_change": "BOOLEAN DEFAULT FALSE NOT NULL",
        "blocked_until": "TIMESTAMP",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f'ALTER TABLE "user" ADD COLUMN {name} {sql_type}'))


def _ensure_captive_portal_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("captiveportal"):
        return
    columns = {column["name"] for column in inspector.get_columns("captiveportal")}
    column_types = {
        "primary_color": "VARCHAR",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE captiveportal ADD COLUMN {name} {sql_type}"))


def _ensure_telegram_connection_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("telegramconnection"):
        return
    columns = {column["name"] for column in inspector.get_columns("telegramconnection")}
    column_types = {
        "secondary_chat_id": "VARCHAR",
        "secondary_chat_title": "VARCHAR",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE telegramconnection ADD COLUMN {name} {sql_type}"))


def _ensure_notification_preference_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("notificationpreference"):
        return
    columns = {column["name"] for column in inspector.get_columns("notificationpreference")}
    column_types = {
        "bulk_sms_voucher_enabled": "BOOLEAN DEFAULT FALSE NOT NULL",
        "bulk_sms_low_balance_enabled": "BOOLEAN DEFAULT FALSE NOT NULL",
        "bulk_sms_low_balance_threshold": "INTEGER DEFAULT 1000 NOT NULL",
        "bulk_sms_admin_buy_for_enabled": "BOOLEAN DEFAULT FALSE NOT NULL",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE notificationpreference ADD COLUMN {name} {sql_type}"))


def _bootstrap_platform_admins() -> None:
    from app.core.config import settings

    emails = {
        email.strip().lower()
        for email in settings.platform_admin_emails.split(",")
        if email.strip()
    }
    if not emails:
        return
    with Session(engine) as session:
        users = session.exec(select(User).where(sa.func.lower(User.email).in_(emails))).all()
        for user in users:
            user.platform_role = "superadmin"
            user.platform_permissions = "*"
            session.add(user)
        session.commit()


def _ensure_router_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("router"):
        return
    columns = {column["name"] for column in inspector.get_columns("router")}
    column_types = {
        "mac_address": "VARCHAR",
        "model": "VARCHAR",
        "os_version": "VARCHAR",
        "ppp_username": "VARCHAR",
        "ppp_password_encrypted": "VARCHAR",
        "tunnel_ip": "VARCHAR",
        "nat_port": "INTEGER",
        "nat_rule_id": "VARCHAR",
        "snmp_nat_rule_id": "VARCHAR",
        "winbox_nat_port": "INTEGER",
        "winbox_nat_rule_id": "VARCHAR",
        "api_username": "VARCHAR",
        "api_password_encrypted": "VARCHAR",
        "status": "VARCHAR DEFAULT 'pending' NOT NULL",
        "snmp_status": "VARCHAR DEFAULT 'unknown' NOT NULL",
        "snmp_configured": "BOOLEAN DEFAULT FALSE NOT NULL",
        "snmp_checked_at": "TIMESTAMP",
        "snmp_uptime_seconds": "INTEGER",
        "snmp_error": "TEXT",
        "heartbeat_status": "VARCHAR DEFAULT 'unknown' NOT NULL",
        "heartbeat_at": "TIMESTAMP",
        "heartbeat_hourly_notified_at": "TIMESTAMP",
        "connected_at": "TIMESTAMP",
        "disconnected_at": "TIMESTAMP",
        "last_seen": "TIMESTAMP",
        "trial_enabled": "BOOLEAN DEFAULT FALSE NOT NULL",
        "trial_minutes": "INTEGER DEFAULT 30 NOT NULL",
        "hotspot_provisioned": "BOOLEAN DEFAULT FALSE NOT NULL",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE router ADD COLUMN {name} {sql_type}"))
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_router_ppp_username_unique "
            "ON router (ppp_username) WHERE ppp_username IS NOT NULL"
        ))
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_router_nat_port_unique "
            "ON router (nat_port) WHERE nat_port IS NOT NULL"
        ))
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_router_winbox_nat_port_unique "
            "ON router (winbox_nat_port) WHERE winbox_nat_port IS NOT NULL"
        ))
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_router_mac_address_unique "
            "ON router (mac_address) WHERE mac_address IS NOT NULL"
        ))


def _ensure_voucher_purchase_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("voucherpurchase"):
        return
    columns = {column["name"] for column in inspector.get_columns("voucherpurchase")}
    column_types = {
        "activated_at": "TIMESTAMP",
        "expires_at": "TIMESTAMP",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE voucherpurchase ADD COLUMN {name} {sql_type}"))


def _ensure_portal_ad_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("portalad"):
        return
    columns = {column["name"] for column in inspector.get_columns("portalad")}
    column_types = {
        "advertiser_name": "VARCHAR DEFAULT '' NOT NULL",
        "business_type": "VARCHAR DEFAULT 'other' NOT NULL",
        "sort_order": "INTEGER DEFAULT 0 NOT NULL",
    }
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(sa.text(
                "ALTER TABLE portalad DROP CONSTRAINT IF EXISTS uq_portal_ad_router_id"
            ))
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE portalad ADD COLUMN {name} {sql_type}"))


def _ensure_branch_wallet_transaction_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("branchwallettransaction"):
        return
    columns = {column["name"] for column in inspector.get_columns("branchwallettransaction")}
    column_types = {
        "recipient_phone": "VARCHAR",
        "gateway_reference": "VARCHAR",
        "gateway_status": "VARCHAR",
        "failure_reason": "VARCHAR",
        "last_checked_at": "TIMESTAMP",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE branchwallettransaction ADD COLUMN {name} {sql_type}"))
        conn.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_branchwallettransaction_gateway_reference "
            "ON branchwallettransaction (gateway_reference)"
        ))


def _ensure_branch_wallet_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("branchwallet"):
        return
    columns = {column["name"] for column in inspector.get_columns("branchwallet")}
    column_types = {
        "withdrawal_passcode_hash": "VARCHAR",
        "withdrawal_method": "VARCHAR DEFAULT 'email' NOT NULL",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE branchwallet ADD COLUMN {name} {sql_type}"))


def _ensure_sms_wallet_transaction_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("smswallettransaction"):
        return
    columns = {column["name"] for column in inspector.get_columns("smswallettransaction")}
    column_types = {
        "source_wallet_transaction_id": "UUID",
        "phone_number": "VARCHAR",
        "gateway_reference": "VARCHAR",
        "gateway_status": "VARCHAR",
        "failure_reason": "VARCHAR",
        "last_checked_at": "TIMESTAMP",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE smswallettransaction ADD COLUMN {name} {sql_type}"))
        conn.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_smswallettransaction_gateway_reference "
            "ON smswallettransaction (gateway_reference)"
        ))


def _ensure_platform_sms_transaction_columns() -> None:
    inspector = sa.inspect(engine)
    if not inspector.has_table("platformsmstransaction"):
        return
    columns = {column["name"] for column in inspector.get_columns("platformsmstransaction")}
    column_types = {
        "recipient_phone": "VARCHAR",
        "gateway_reference": "VARCHAR",
        "gateway_status": "VARCHAR",
        "failure_reason": "VARCHAR",
        "last_checked_at": "TIMESTAMP",
        "completed_at": "TIMESTAMP",
    }
    with engine.begin() as conn:
        for name, sql_type in column_types.items():
            if name not in columns:
                conn.execute(sa.text(f"ALTER TABLE platformsmstransaction ADD COLUMN {name} {sql_type}"))
        conn.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_platformsmstransaction_gateway_reference "
            "ON platformsmstransaction (gateway_reference)"
        ))
