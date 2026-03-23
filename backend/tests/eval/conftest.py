"""Fixtures for the Winston evaluation harness."""
import json
import os
from pathlib import Path

import pytest

# Ensure env vars are set before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")


_SEED_PATH = Path(__file__).parent / "seed_qa_pairs.json"


@pytest.fixture(scope="session")
def seed_qa_pairs() -> list[dict]:
    """Load the seed QA pairs from JSON."""
    with open(_SEED_PATH) as f:
        return json.loads(f.read())


@pytest.fixture(scope="session")
def eval_results(tmp_path_factory):
    """Collect evaluation results and write to results.json at teardown."""
    results: list[dict] = []
    yield results
    out_path = Path(__file__).parent / "results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)


def _make_minimal_envelope():
    """Build a minimal AssistantContextEnvelope for testing."""
    from app.schemas.ai_gateway import (
        AssistantContextEnvelope,
        AssistantSessionContext,
        AssistantThreadContext,
        AssistantUiContext,
        AssistantVisibleData,
    )

    return AssistantContextEnvelope(
        session=AssistantSessionContext(
            user_id="test-user",
            org_id="test-org",
            actor="test-actor",
            roles=["admin"],
        ),
        ui=AssistantUiContext(
            route="/lab/env/test-env/repe",
            surface="chat",
            active_environment_id="test-env-id",
            visible_data=AssistantVisibleData(),
        ),
        thread=AssistantThreadContext(
            thread_id="test-thread",
            assistant_mode="environment_copilot",
        ),
    )


def _make_minimal_scope():
    """Build a minimal ResolvedAssistantScope for testing."""
    from app.schemas.ai_gateway import ResolvedAssistantScope

    return ResolvedAssistantScope(
        resolved_scope_type="environment",
        environment_id="test-env-id",
        business_id="test-business-id",
        confidence=1.0,
        source="parameter",
    )


@pytest.fixture
def minimal_envelope():
    return _make_minimal_envelope()


@pytest.fixture
def minimal_scope():
    return _make_minimal_scope()
