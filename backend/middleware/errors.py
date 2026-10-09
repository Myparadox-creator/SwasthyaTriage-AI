"""Centralized error handling.

All errors leave the API as typed JSON — never stack traces.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("swasthyatriage")


class AppError(Exception):
    """Application error with a stable machine-readable code."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        code: str = "bad_request",
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, status_code=404, code="not_found")


class ForbiddenError(AppError):
    def __init__(self, message: str = "You do not have permission to perform this action") -> None:
        super().__init__(message, status_code=403, code="forbidden")


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(message, status_code=401, code="unauthorized")


def _body(request: Request, *, code: str, message: str, details: dict | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(request, code=exc.code, message=exc.message, details=exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = {
            "fields": [
                {"field": ".".join(str(p) for p in e.get("loc", [])), "message": e.get("msg")}
                for e in exc.errors()
            ]
        }
        return JSONResponse(
            status_code=422,
            content=_body(
                request,
                code="validation_error",
                message="One or more fields are invalid.",
                details=details,
            ),
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        logger.warning("Integrity error: %s", exc)
        return JSONResponse(
            status_code=409,
            content=_body(
                request,
                code="conflict",
                message="The request conflicts with existing data.",
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        logger.exception("Unhandled error [%s] %s %s", request_id, request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=_body(
                request,
                code="internal_error",
                message="Something went wrong. The incident has been logged.",
                details={"request_id": request_id},
            ),
        )
