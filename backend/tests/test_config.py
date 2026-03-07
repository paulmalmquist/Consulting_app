"""Tests for config / bootstrap behavior."""


def test_clean_env_value_strips_whitespace():
    """Environment values should tolerate trailing whitespace/newlines from deploy UIs."""
    from app.config import _clean_env_value

    assert _clean_env_value("  postgres://user:pass@host/db?sslmode=require\n") == (
        "postgres://user:pass@host/db?sslmode=require"
    )


def test_allowed_origins_parsing():
    """ALLOWED_ORIGINS should parse comma-separated values."""
    from app.config import ALLOWED_ORIGINS

    # The default is "http://localhost:3000" (from os.getenv fallback)
    assert isinstance(ALLOWED_ORIGINS, list)
    assert len(ALLOWED_ORIGINS) >= 1
    # Each origin should be stripped of whitespace
    for origin in ALLOWED_ORIGINS:
        assert origin == origin.strip()


def test_database_url_set():
    """DATABASE_URL must be set (conftest provides a test value)."""
    from app.config import DATABASE_URL

    assert DATABASE_URL != ""


def test_require_database_url_trims_runtime_value(monkeypatch):
    """DATABASE_URL with trailing newlines must not break psycopg connection parsing."""
    from app import config

    monkeypatch.setattr(
        config,
        "DATABASE_URL",
        "postgresql://test:test@localhost:5432/test?sslmode=require\n",
    )

    assert config.require_database_url() == (
        "postgresql://test:test@localhost:5432/test?sslmode=require"
    )
