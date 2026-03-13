"""Fixtures and marks for dashboard validation tests."""
from __future__ import annotations

import os
import pytest

# Ensure env vars are set so imports don't blow up
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")


ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
BUS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001"


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "live: requires a live database connection")


@pytest.fixture(scope="module")
def env_id() -> str:
    return ENV_ID


@pytest.fixture(scope="module")
def bus_id() -> str:
    return BUS_ID


@pytest.fixture(scope="module")
def fund_id() -> str:
    return FUND_ID
