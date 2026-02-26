"""Tests for config / bootstrap behavior."""



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
