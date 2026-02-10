"""Shared fixtures for Demo Lab backend tests.

Mocks the database layer and external services so tests run without Postgres/Supabase.
"""

import os
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

# Set env vars before importing app modules
os.environ.setdefault("SUPABASE_DB_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("SUPABASE_STORAGE_BUCKET", "test-uploads")
os.environ.setdefault("LLM_PROVIDER", "none")  # no real LLM calls

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """FastAPI test client for Demo Lab API."""
    return TestClient(app)
