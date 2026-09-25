from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def make(**kwargs: object) -> Settings:
    return Settings(_env_file=None, **kwargs)  # type: ignore[arg-type]


def test_production_requires_database_and_supabase() -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL, SUPABASE_URL"):
        make(environment="production")


def test_production_ok_when_configured() -> None:
    s = make(
        environment="production",
        database_url="postgresql://u:p@h:5432/postgres",
        supabase_url="https://x.supabase.co",
    )
    assert s.is_production
    assert s.docs_enabled is False
    assert make(environment="production", enable_docs=True, database_url="x://", supabase_url="y")


def test_cors_origins_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, http://localhost:5173/")
    assert make().cors_origins == ["https://app.example.com", "http://localhost:5173"]


def test_cors_wildcard_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(ValidationError, match="not allowed"):
        make()


def test_database_url_normalised_for_asyncpg() -> None:
    s = make(
        database_url=(
            "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
            "?sslmode=require"
        )
    )
    resolved = s.sqlalchemy_database_url()
    assert resolved is not None
    url, ssl = resolved
    assert url.drivername == "postgresql+asyncpg"
    assert url.username == "postgres.ref"
    assert "sslmode" not in url.query
    assert ssl == "require"


def test_derived_urls_and_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc123")
    s = make(supabase_url="https://x.supabase.co/")
    assert s.jwt_issuer == "https://x.supabase.co/auth/v1"
    assert s.jwks_url == "https://x.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.version == "abc123"
    assert make().sqlalchemy_database_url() is None
