"""SwasthyaTriage AI — FastAPI entrypoint.

Positioning: AI assists. Healthcare professionals decide.
This API is non-diagnostic and reviewer-facing by design.
"""

import logging
import uuid
from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from api.admin import router as admin_router
from api.auth import router as auth_router
from api.cases import router as cases_router
from api.chat import router as chat_router
from api.documents import router as documents_router
from api.email_admin import router as email_admin_router
from api.exports import router as exports_router
from api.facilities import router as facilities_router
from api.followups import router as followups_router
from api.notifications import router as notifications_router
from api.patients import router as patients_router
from api.referrals import router as referrals_router
from api.reviews import router as reviews_router
from api.safety import router as safety_router
from api.telecalls import router as telecalls_router
from api.voice import router as voice_router
from config import settings
from middleware.errors import install_error_handlers
from middleware.ratelimit import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("swasthyatriage")

app = FastAPI(
    title="SwasthyaTriage AI API",
    description=(
        "Multimodal AI-assisted triage support. Collects, organizes and prioritizes "
        "patient-provided information for qualified healthcare professional review. "
        "This system does not diagnose, prescribe or replace clinical judgement."
    ),
    version="0.1.0",
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "rate_limited",
                "message": "Too many requests. Please slow down and try again shortly.",
                "details": {},
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next: Callable):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


install_error_handlers(app)

app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(cases_router)
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(reviews_router)
app.include_router(followups_router)
app.include_router(referrals_router)
app.include_router(safety_router)
app.include_router(voice_router)
app.include_router(telecalls_router)
app.include_router(exports_router)
app.include_router(admin_router)
app.include_router(notifications_router)
app.include_router(facilities_router)
app.include_router(email_admin_router)


@app.get("/api/health")
def health() -> dict:
    from database.session import SessionLocal
    from services.gemini.base import provider_label
    from services.storage import resolve_storage_path

    db_state = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_state = "error"

    storage_state = "ok"
    try:
        root = resolve_storage_path("uploads")
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".health_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        storage_state = "error"

    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "db": db_state,
        "storage": storage_state,
        "providers": {
            "gemini": provider_label(),
            "telephony": settings.telephony_provider,
            "email": settings.email_delivery_mode if settings.brevo_api_key else "not_configured",
        },
    }
