import os
from pathlib import Path


def load_dotenv() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()


class Settings:
    database_url: str = os.getenv("DB_URL", "sqlite:///./tresa.db")
    jwt_secret: str = os.getenv("JWT_SECRET", os.getenv("RESEND_KEY", "change-me-in-production"))
    jwt_issuer: str = os.getenv("JWT_ISSUER", "tresa-backend")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    resend_key: str | None = os.getenv("RESEND_KEY")
    email_from: str = os.getenv("EMAIL_FROM", "Renult <support@info.pitbox.fun>")
    google_client_id: str | None = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret: str | None = os.getenv("GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    google_oauth_insecure_transport: bool = os.getenv("GOOGLE_OAUTH_INSECURE_TRANSPORT", "true").lower() == "true"
    africastalking_username: str | None = os.getenv("AFRICASTALKING_USERNAME")
    africastalking_api_key: str | None = os.getenv("AFRICASTALKING_API_KEY")
    africastalking_sender_id: str | None = os.getenv("AFRICASTALKING_SENDER_ID") or None
    africastalking_enqueue: bool = os.getenv("AFRICASTALKING_ENQUEUE", "true").lower() == "true"
    sms_notification_cost: int = int(os.getenv("SMS_NOTIFICATION_COST", "29"))
    r2_account_id: str | None = os.getenv("R2_ACCOUNT_ID")
    r2_access_key_id: str | None = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str | None = os.getenv("R2_BUCKET_NAME")
    r2_endpoint_url: str | None = os.getenv("R2_ENDPOINT_URL")
    r2_public_base_url: str | None = os.getenv("R2_PUBLIC_BASE_URL")
    upload_max_bytes: int = int(os.getenv("UPLOAD_MAX_BYTES", str(20 * 1024 * 1024)))
    snmp_monitor_enabled: bool = os.getenv("SNMP_MONITOR_ENABLED", "true").lower() == "true"
    snmp_community: str = os.getenv("SNMP_COMMUNITY", "public")
    snmp_port: int = int(os.getenv("SNMP_PORT", "161"))
    snmp_poll_interval_seconds: int = int(os.getenv("SNMP_POLL_INTERVAL_SECONDS", "60"))
    snmp_timeout_seconds: float = float(os.getenv("SNMP_TIMEOUT_SECONDS", "3"))
    credential_encryption_key: str | None = os.getenv("CREDENTIAL_ENCRYPTION_KEY")
    router_registration_secret: str = os.getenv("ROUTER_REGISTRATION_SECRET", jwt_secret)
    chr_host: str = os.getenv("CHR_HOST", "23.92.30.38")
    chr_api_port: int = int(os.getenv("CHR_API_PORT", ""))
    chr_api_username: str = os.getenv("CHR_API_USERNAME", "tresachr")
    chr_api_password: str = os.getenv("CHR_API_PASSWORD", "")
    chr_plaintext_login: bool = os.getenv("CHR_PLAINTEXT_LOGIN", "true").lower() == "true"
    chr_tunnel_local_address: str = os.getenv("CHR_TUNNEL_LOCAL_ADDRESS", "10.0.0.1")
    router_l2tp_ipsec_secret: str = os.getenv("ROUTER_L2TP_IPSEC_SECRET", "")
    router_api_internal_port: int = int(os.getenv("ROUTER_API_INTERNAL_PORT", "8728"))
    router_winbox_internal_port: int = int(os.getenv("ROUTER_WINBOX_INTERNAL_PORT", "8291"))
    router_nat_port_min: int = int(os.getenv("ROUTER_NAT_PORT_MIN", "49152"))
    router_nat_port_max: int = int(os.getenv("ROUTER_NAT_PORT_MAX", "65534"))
    concentrator_enabled: bool = os.getenv("CONCENTRATOR_ENABLED", "true").lower() == "true"
    concentrator_remove_nat_on_disconnect: bool = os.getenv(
        "CONCENTRATOR_REMOVE_NAT_ON_DISCONNECT", "false"
    ).lower() == "true"
    concentrator_rotate_port_on_reconnect: bool = os.getenv(
        "CONCENTRATOR_ROTATE_PORT_ON_RECONNECT", "false"
    ).lower() == "true"


settings = Settings()
