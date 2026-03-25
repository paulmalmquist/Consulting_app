"""Tests for Demo Lab config."""

from app.config import get_settings


def test_settings_loads():
    settings = get_settings()
    assert settings.supabase_storage_bucket == "test-uploads"


def test_settings_allowed_origins():
    settings = get_settings()
    assert isinstance(settings.allowed_origins, list)
