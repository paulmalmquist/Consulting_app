"""Tests for MCP rate limiter."""

import os
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

import pytest

from app.mcp.rate_limit import TokenBucket, RateLimitExceeded


def test_allows_within_limit():
    bucket = TokenBucket(rpm=60)
    for _ in range(60):
        bucket.consume()


def test_raises_when_exceeded():
    bucket = TokenBucket(rpm=5)
    for _ in range(5):
        bucket.consume()
    with pytest.raises(RateLimitExceeded):
        bucket.consume()


def test_retry_after_is_positive():
    bucket = TokenBucket(rpm=1)
    bucket.consume()
    try:
        bucket.consume()
        assert False, "Should have raised"
    except RateLimitExceeded as e:
        assert e.retry_after_seconds > 0
