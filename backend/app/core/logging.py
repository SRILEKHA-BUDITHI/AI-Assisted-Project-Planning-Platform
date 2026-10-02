"""Structured JSON logging with per-request context (request id, user id)."""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


@dataclass(slots=True)
class RequestContext:
    """Mutable per-request state.

    Stored by reference in a ContextVar so that values set deep inside the
    request (e.g. the user id resolved by the auth dependency) are visible to
    the access-log middleware even if a framework layer copied the context.
    """

    request_id: str
    user_id: str | None = None


_request_context: ContextVar[RequestContext | None] = ContextVar("request_context", default=None)


def get_request_context() -> RequestContext | None:
    return _request_context.get()


def bind_request_context(ctx: RequestContext) -> Token[RequestContext | None]:
    return _request_context.set(ctx)


def reset_request_context(token: Token[RequestContext | None]) -> None:
    _request_context.reset(token)


def set_user_id(user_id: str) -> None:
    ctx = _request_context.get()
    if ctx is not None:
        ctx.user_id = user_id


# Attributes present on every LogRecord; anything else passed via `extra=` is emitted.
_RESERVED = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys() | {"message", "asctime", "taskName"}
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        ctx = _request_context.get()
        if ctx is not None:
            payload["request_id"] = ctx.request_id
            if ctx.user_id:
                payload["user_id"] = ctx.user_id
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)

    # Route uvicorn through our formatter; its own access log is replaced by ours.
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers[:] = []
        lg.propagate = True
    access = logging.getLogger("uvicorn.access")
    access.handlers[:] = []
    access.propagate = False
    access.disabled = True
