"""TelephonyService factory and dispatcher."""

from __future__ import annotations

from config import settings
from services.telephony.base import TelephonyProvider
from services.telephony.mock import MockTelephonyProvider
from services.telephony.snapserve import SnapServeProvider
from services.telephony.videosdk import VideoSDKProvider

_PROVIDERS: dict[str, type[TelephonyProvider]] = {
    "mock": MockTelephonyProvider,
    "videosdk": VideoSDKProvider,
    "snapserve": SnapServeProvider,
}


def get_telephony_provider(name: str | None = None) -> TelephonyProvider:
    """Return the configured telephony provider singleton or instance."""
    provider_name = (name or settings.telephony_provider or "mock").lower()
    cls = _PROVIDERS.get(provider_name, MockTelephonyProvider)
    return cls()
