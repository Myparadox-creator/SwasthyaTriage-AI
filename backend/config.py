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
    telephony_provider: str = "mock"  # mock | videosdk
    videosdk_auth_token: str = ""
    videosdk_api_key: str = ""
    videosdk_secret_key: str = ""
    videosdk_sip_from: str = ""
    videosdk_routing_rule_id: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # Brevo Transactional Email System
    brevo_api_key: str = ""
    brevo_sender_email: str = "noreply@swasthyatriage.gov.in"
    brevo_sender_name: str = "SwasthyaFlow AI"
    brevo_reply_to_email: str = "support@swasthyatriage.gov.in"
    app_base_url: str = "http://localhost:5173"
    email_delivery_mode: str = "live"  # live | mock
    email_request_timeout_seconds: float = 10.0
    brevo_webhook_secret: str = ""

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
