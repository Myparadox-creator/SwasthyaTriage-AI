"""Application configuration loaded from environment / .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "SwasthyaTriage AI"
    environment: str = "development"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_upload_mb: int = 20
    storage_dir: str = "storage"

    # Document storage backend. "local" writes to storage_dir (needs a writable,
    # persistent disk — fine for a VM but not for most serverless platforms).
    # "s3" stores uploads in any S3-compatible bucket (AWS S3, Cloudflare R2,
    # MinIO, Neon object storage). Requires `pip install boto3`; if boto3 is
    # absent the app logs a warning and falls back to local disk rather than
    # failing uploads.
    storage_backend: str = "local"
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_prefix: str = ""

    # Database
    database_url: str = "postgresql+psycopg://localhost:5432/swasthyatriage"

    # Auth
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 7
    cookie_secure: bool = False

    # Clerk (social sign-in bridge).
    clerk_issuer: str = "https://needed-boxer-6091.clerk.accounts.dev"
    clerk_secret_key: str = "sk_test_IU3Vkc5Ky3otgQL2euDgNEMhLvsTCOPQuZocrYi9SZ"
    clerk_timeout_seconds: float = 3.0

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3-flash-preview"
    gemini_live_model: str = "gemini-2.5-flash-native-audio-preview-12-2025"

    # Telephony
    telephony_provider: str = "mock"  # mock | videosdk | snapserve
    videosdk_auth_token: str = ""
    videosdk_api_key: str = ""
    videosdk_secret_key: str = ""
    videosdk_sip_from: str = ""
    videosdk_routing_rule_id: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # SnapServe AI voice-agent calling (real outbound PSTN calls).
    # The agent runs the live conversation; we mirror status/transcript back.
    snapserve_api_key: str = ""
    snapserve_agent_id: int | None = None
    snapserve_from_number: str = ""
    snapserve_base_url: str = "https://app.snapserve.ai/api"

    # Patient callbacks + telephony webhooks
    # HMAC secret used to verify provider call-status webhooks. Empty => endpoint disabled.
    telephony_webhook_secret: str = ""
    # Supplementary contact Sonam surfaces on red-flag emergencies. National 112/108
    # guidance is always given; this number is never dialed automatically.
    emergency_escalation_contact: str = "6370659934"

    # Transactional Email System
    email_provider: str = "gmail"  # gmail | resend
    app_base_url: str = "http://localhost:5173"
    email_delivery_mode: str = "live"  # live | mock
    email_request_timeout_seconds: float = 10.0
    email_reply_to: str = "support@swasthyatriage.gov.in"

    # Gmail SMTP provider (works to any recipient without a verified domain)
    gmail_smtp_user: str = ""
    gmail_smtp_app_password: str = ""
    gmail_sender_email: str = ""  # defaults to gmail_smtp_user
    gmail_sender_name: str = "SwasthyaFlow AI"
    gmail_smtp_host: str = "smtp.gmail.com"
    gmail_smtp_port: int = 587

    # Resend provider (requires a verified sender domain for real recipients)
    resend_api_key: str = ""
    resend_sender_email: str = "onboarding@resend.dev"
    resend_sender_name: str = "SwasthyaFlow AI"
    resend_reply_to_email: str = "support@swasthyatriage.gov.in"
    resend_webhook_secret: str = ""

    # Admin alerts: notified whenever a user wants to talk to the Sonam voice agent.
    admin_notification_email: str = "abhisheksahu1018@gmail.com"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def storage_root(self) -> Path:
        """Absolute location where uploaded files are stored.

        Relative paths resolve against the backend package directory so the
        app works regardless of the process CWD.
        """
        p = Path(self.storage_dir)
        if p.is_absolute():
            return p
        return Path(__file__).resolve().parent / p

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def telephony_live(self) -> bool:
        """True only when a real outbound telephony provider is fully configured.

        The mock provider never places real calls. VideoSDK here only provisions
        meeting rooms (not a PSTN dialer), so it counts as "live" only when its
        credentials are actually present.
        """
        provider = (self.telephony_provider or "mock").lower()
        if provider == "mock":
            return False
        if provider == "videosdk":
            return bool(
                self.videosdk_auth_token
                or (self.videosdk_api_key and self.videosdk_secret_key)
            )
        if provider == "snapserve":
            return bool(self.snapserve_api_key and self.snapserve_agent_id)
        return False

    @property
    def callback_mode(self) -> str:
        """Honest mode string surfaced to patients: mock | live."""
        return "live" if self.telephony_live else "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
