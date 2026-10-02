"""Cross-cutting behaviour: health, request id, headers, CORS, problem+json."""

from __future__ import annotations

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_health_without_db(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "dev"}


def test_health_reports_git_sha(settings: Settings) -> None:
    app = create_app(settings.model_copy(update={"railway_git_commit_sha": "deadbeef"}))
    with TestClient(app) as c:
        assert c.get("/health").json()["version"] == "deadbeef"


def test_ready_is_503_without_db(client: TestClient) -> None:
    r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.headers["content-type"] == "application/problem+json"


def test_module_level_app_imports() -> None:
    from app.main import app

    assert isinstance(app, FastAPI)


def test_request_id_generated_and_echoed(client: TestClient) -> None:
    r = client.get("/health")
    assert len(r.headers["x-request-id"]) == 32
    r = client.get("/health", headers={"X-Request-ID": "abc-123-def-456"})
    assert r.headers["x-request-id"] == "abc-123-def-456"


def test_malformed_request_id_replaced(client: TestClient) -> None:
    for bad in ("short", "has spaces in it", "inject;newline-0001", "x" * 200):
        r = client.get("/health", headers={"X-Request-ID": bad})
        assert r.headers["x-request-id"] != bad
        assert len(r.headers["x-request-id"]) == 32


def test_security_headers(client: TestClient) -> None:
    h = client.get("/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert h["content-security-policy"].startswith("default-src 'none'")
    assert "strict-transport-security" not in h


def test_hsts_in_production(settings: Settings) -> None:
    prod = settings.model_copy(
        update={"environment": "production", "database_url": None, "enable_docs": False}
    )
    with TestClient(create_app(prod)) as c:
        assert "strict-transport-security" in c.get("/health").headers
        assert c.get("/api/docs").status_code == 404
        assert c.get("/api/openapi.json").status_code == 404


def test_docs_available_outside_production(client: TestClient) -> None:
    r = client.get("/api/docs")
    assert r.status_code == 200
    assert "cdn.jsdelivr.net" in r.headers["content-security-policy"]
    spec = client.get("/api/openapi.json").json()
    assert "/api/v1/orgs/{orgId}/projects" in spec["paths"]


def test_cors_allowed_origin(client: TestClient) -> None:
    r = client.options(
        "/api/v1/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert r.headers["access-control-allow-credentials"] == "true"


def test_cors_disallowed_origin(client: TestClient) -> None:
    r = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in r.headers


def test_unknown_route_is_problem_json(client: TestClient) -> None:
    r = client.get("/api/v1/nope", headers={"X-Request-ID": "req-00000001"})
    assert r.status_code == 404
    assert r.headers["content-type"] == "application/problem+json"
    body = r.json()
    assert body["type"] == "about:blank"
    assert body["status"] == 404
    assert body["instance"] == "/api/v1/nope"
    assert body["requestId"] == "req-00000001"


def test_method_not_allowed_is_problem_json(client: TestClient) -> None:
    r = client.put("/health")
    assert r.status_code == 405
    assert r.headers["content-type"] == "application/problem+json"


def test_unhandled_error_is_500_without_leak(app: FastAPI) -> None:
    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret internals: password=hunter2")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/boom")
    assert r.status_code == 500
    assert r.headers["content-type"] == "application/problem+json"
    assert "hunter2" not in r.text
    assert "Traceback" not in r.text
    assert r.json()["title"] == "Internal Server Error"
    assert "x-request-id" in r.headers


def test_access_log_line(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="app.access"):
        client.get("/health", headers={"X-Request-ID": "log-test-0001"})
    records = [r for r in caplog.records if r.name == "app.access"]
    assert records
    rec = records[-1]
    assert rec.__dict__["method"] == "GET"
    assert rec.__dict__["path"] == "/health"
    assert rec.__dict__["status"] == 200
    assert isinstance(rec.__dict__["duration_ms"], float)


def test_json_formatter_includes_context() -> None:
    from app.core.logging import (
        JsonFormatter,
        RequestContext,
        bind_request_context,
        reset_request_context,
        set_user_id,
    )

    token = bind_request_context(RequestContext(request_id="rid-1"))
    try:
        set_user_id("user-1")
        record = logging.LogRecord("x", logging.INFO, __file__, 1, "hello", (), None)
        record.status = 200
        out = json.loads(JsonFormatter().format(record))
    finally:
        reset_request_context(token)
    assert out["msg"] == "hello"
    assert out["request_id"] == "rid-1"
    assert out["user_id"] == "user-1"
    assert out["status"] == 200
