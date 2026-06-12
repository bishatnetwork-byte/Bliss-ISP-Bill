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
    WithdrawalChallenge,
    Wallet,
    WalletTransaction,
    BranchWallet,
    BranchWalletTransaction,
    PlatformLedgerEntry,
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
        WithdrawalChallenge,
        Wallet,
        WalletTransaction,
        BranchWallet,
        BranchWalletTransaction,
        PlatformLedgerEntry,
    )
    SQLModel.metadata.create_all(engine)
    _ensure_staff_columns()
    _ensure_router_columns()

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
        "connected_at": "TIMESTAMP",
        "disconnected_at": "TIMESTAMP",
        "last_seen": "TIMESTAMP",
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
