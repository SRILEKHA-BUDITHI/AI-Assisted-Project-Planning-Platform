"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import health
from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.db import create_engine
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import (
    REQUEST_ID_HEADER,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.security import TokenVerifier

logger = logging.getLogger("app")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "starting",
            extra={"environment": settings.environment, "version": settings.version},
        )
        try:
            yield
        finally:
            engine = app.state.engine
            if engine is not None:
                await engine.dispose()

    docs = settings.docs_enabled
    app = FastAPI(
        title="Project Planning API",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )

    # Engine creation is lazy (no connection is opened here).
    app.state.settings = settings
    app.state.engine = create_engine(settings)
    app.state.token_verifier = TokenVerifier.from_settings(settings)
    if app.state.engine is None:
        logger.warning("DATABASE_URL is not set; database endpoints will return 503")
    if app.state.token_verifier is None:
        logger.warning("SUPABASE_URL is not set; authenticated endpoints will return 503")

    register_exception_handlers(app)

    # Last added = outermost. Order (outer -> inner): CORS, security headers,
    # request context/access log, app.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER, "Idempotency-Key"],
            expose_headers=[REQUEST_ID_HEADER, "Location"],
            max_age=600,
        )

    app.include_router(health.router)
    app.include_router(api_router)
    return app


app = create_app()
