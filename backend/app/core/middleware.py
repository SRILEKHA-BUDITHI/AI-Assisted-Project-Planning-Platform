"""Pure-ASGI middleware: request id + access log, and security headers."""

from __future__ import annotations

import logging
import re
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import problem_response
from app.core.logging import RequestContext, bind_request_context, reset_request_context

access_logger = logging.getLogger("app.access")
error_logger = logging.getLogger("app.errors")

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


def _incoming_request_id(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"x-request-id":
            candidate = value.decode("latin-1").strip()
            # Only accept well-formed ids; anything else could be log injection.
            return candidate if _VALID_REQUEST_ID.match(candidate) else None
    return None


class RequestContextMiddleware:
    """Accepts or generates `X-Request-ID`, echoes it, and logs one line per request.

    Also the last line of defence for unhandled errors: returns an RFC 7807
    500 without leaking the stack trace (which is logged instead).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _incoming_request_id(scope) or uuid.uuid4().hex
        ctx = RequestContext(request_id=request_id)
        token = bind_request_context(ctx)
        start = time.perf_counter()
        status_code = 500
        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            error_logger.exception("unhandled exception")
            if response_started:
                raise
            response = problem_response(
                None,
                status=500,
                slug="internal-error",
                extra={"instance": scope.get("path", "")},
            )
            await response(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            access_logger.info(
                "request",
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status_code,
                    "duration_ms": duration_ms,
                },
            )
            reset_request_context(token)


_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
_DOCS_CSP = (
    "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts: bool, docs_prefix: str = "/api/docs") -> None:
        self.app = app
        self.hsts = hsts
        self.docs_prefix = docs_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_docs = str(scope.get("path", "")).startswith(self.docs_prefix)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
                headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
                headers.setdefault("Content-Security-Policy", _DOCS_CSP if is_docs else _API_CSP)
                headers.setdefault("Cache-Control", "no-store")
                if self.hsts:
                    headers.setdefault(
                        "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
                    )
            await send(message)

        await self.app(scope, receive, send_wrapper)
