"""Phase 1 — Winston Legal Knowledge Base + Legal Memory smoke tests.

Two layers:

1. **Unit-style** (default): mocks the DB cursor via the standard FakeCursor
   pattern. Confirms service functions emit env_id+business_id-scoped queries
   and don't leak parameters.

2. **Integration** (opt-in): runs against the real linked Supabase project.
   Creates throwaway tenant/business/env fixtures, exercises seed_kb_demo +
   list endpoints + filters + cross-env isolation, then tears everything
   down. Set RUN_LEGAL_KB_INTEGRATION=1 to enable.

The integration block mirrors the smoke test that was run by hand to
validate the 539_legal_ops_brain.sql migration on 2026-05-02.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

from app.services import legal_ops as svc


# ── Unit-style: mocked-cursor tests ─────────────────────────────────────────


def _mock_cursor_factory(rows_per_call: list[list[dict] | dict | None]):
    """Build a fake get_cursor() yielding a cursor that returns the given
    sequence of result sets across successive execute() calls."""

    class _C:
        def __init__(self):
            self.queries: list[tuple[str, object]] = []
            self._idx = 0

        def execute(self, sql, params=None):
            self.queries.append((sql, params))

        def _next(self):
            if self._idx >= len(rows_per_call):
                return None
            r = rows_per_call[self._idx]
            self._idx += 1
            return r

        def fetchall(self):
            r = self._next()
            return r if isinstance(r, list) else (r or [])

        def fetchone(self):
            r = self._next()
            if isinstance(r, list):
                return r[0] if r else None
            return r

    cur = _C()

    @contextmanager
    def fake_get_cursor():
        yield cur

    return fake_get_cursor, cur


def test_list_playbooks_scopes_by_env_and_business():
    fake, cur = _mock_cursor_factory([[]])
    with patch("app.services.legal_ops.get_cursor", fake):
        svc.list_playbooks(env_id=uuid4(), business_id=uuid4())
    sql, params = cur.queries[0]
    assert "env_id = %s::uuid" in sql
    assert "business_id = %s::uuid" in sql
    assert len(params) == 2


def test_list_clauses_scopes_by_env_and_business():
    fake, cur = _mock_cursor_factory([[]])
    with patch("app.services.legal_ops.get_cursor", fake):
        svc.list_clauses(env_id=uuid4(), business_id=uuid4())
    sql, _ = cur.queries[0]
    assert "FROM legal_clause_library" in sql
    assert "env_id = %s::uuid" in sql
    assert "business_id = %s::uuid" in sql


def test_list_prior_decisions_filter_includes_contract_type_and_clause_key():
    fake, cur = _mock_cursor_factory([[]])
    with patch("app.services.legal_ops.get_cursor", fake):
        svc.list_prior_decisions(
            env_id=uuid4(), business_id=uuid4(),
            contract_type="MSA", clause_key="liability_cap",
        )
    sql, params = cur.queries[0]
    assert "contract_type = %s" in sql
    assert "clause_key = %s" in sql
    assert "MSA" in params
    assert "liability_cap" in params


def test_list_prior_decisions_no_filter_omits_clauses():
    fake, cur = _mock_cursor_factory([[]])
    with patch("app.services.legal_ops.get_cursor", fake):
        svc.list_prior_decisions(env_id=uuid4(), business_id=uuid4())
    sql, params = cur.queries[0]
    assert "contract_type = %s" not in sql
    assert "clause_key = %s" not in sql
    assert len(params) == 2  # only env_id, business_id


def test_create_clause_jsonifies_tags():
    fake, cur = _mock_cursor_factory([[{"clause_id": uuid4()}]])
    with patch("app.services.legal_ops.get_cursor", fake):
        svc.create_clause(
            env_id=uuid4(), business_id=uuid4(),
            payload={
                "clause_key": "k", "clause_label": "L",
                "tags_json": ["a", "b"], "created_by": "test",
            },
        )
    sql, params = cur.queries[0]
    assert "INSERT INTO legal_clause_library" in sql
    # tags_json must be serialized JSON string passed to %s::jsonb
    assert '["a", "b"]' in [p for p in params if isinstance(p, str)]


def test_seed_kb_demo_short_circuits_when_already_seeded():
    """If a playbook already exists for (env, business), seed_kb_demo
    must return seeded=False and not insert anything else."""
    fake, cur = _mock_cursor_factory([
        [{"playbook_id": uuid4()}],   # the SELECT 1 ... LIMIT 1 returns a row
    ])
    with patch("app.services.legal_ops.get_cursor", fake):
        result = svc.seed_kb_demo(env_id=uuid4(), business_id=uuid4())
    assert result == {"seeded": False, "reason": "already_seeded"}
    # Only the existence check should have run
    assert len(cur.queries) == 1
    assert "SELECT 1 FROM legal_playbooks" in cur.queries[0][0]


# ── Integration: live-DB smoke against linked Supabase ─────────────────────
# Opt-in via RUN_LEGAL_KB_INTEGRATION=1.
#
# Mirrors the hand-run smoke test that validated 539_legal_ops_brain.sql in
# prod on 2026-05-02. The fixtures create dedicated tenant/business/env rows
# (in BOTH legacy `tenant`/`business` and the newer `app.tenants`/`app.businesses`
# satellite tables, since legal_* FKs target the legacy public tables but
# `app.environments.business_id` FKs the app.businesses superset), exercise
# every Phase 1 service function, prove env_id and business_id scoping, then
# tear everything down.
#
# When Phase 2+ adds matters / findings / packets that depend on this seed,
# extend this fixture rather than starting a fresh one.

INTEGRATION_FLAG = "RUN_LEGAL_KB_INTEGRATION"
integration = pytest.mark.skipif(
    os.environ.get(INTEGRATION_FLAG) != "1",
    reason=f"set {INTEGRATION_FLAG}=1 to run live-DB integration tests",
)


@pytest.fixture
def live_legal_env(monkeypatch):
    """Set up tenant/business/env fixtures in the LIVE database.

    Uses a direct psycopg connection (not the app pool) so we sidestep
    conftest's mock DATABASE_URL. Then patches every legal_ops `get_cursor`
    callsite to yield a real cursor against this live connection, so the
    service-layer functions under test write to the same DB they were just
    seeded against.
    """
    import psycopg
    from psycopg.rows import dict_row

    # Load real DATABASE_URL from backend/.env (conftest's setdefault may
    # have stuck a fake value if the env wasn't already populated).
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

    real_db_url = os.environ.get("DATABASE_URL", "")
    if not real_db_url or "test:test@localhost" in real_db_url:
        pytest.skip("integration: real DATABASE_URL not loaded")

    conn = psycopg.connect(real_db_url, row_factory=dict_row, autocommit=False)

    @contextmanager
    def _live_cursor():
        cur = conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()

    monkeypatch.setattr("app.services.legal_ops.get_cursor", _live_cursor)

    test_env = uuid4()
    test_business = uuid4()
    test_tenant = uuid4()
    other_env = uuid4()
    other_business = uuid4()
    other_tenant = uuid4()

    with _live_cursor() as cur:
        cur.execute(
            "INSERT INTO tenant (tenant_id, name, slug) VALUES (%s::uuid, %s, %s)",
            (str(test_tenant), "phase1-tenant-test", f"phase1-tenant-test-{test_tenant.hex[:8]}"),
        )
        cur.execute(
            "INSERT INTO app.tenants (tenant_id, name) VALUES (%s::uuid, %s)",
            (str(test_tenant), "phase1-tenant-test"),
        )
        cur.execute(
            "INSERT INTO tenant (tenant_id, name, slug) VALUES (%s::uuid, %s, %s)",
            (str(other_tenant), "phase1-tenant-other", f"phase1-tenant-other-{other_tenant.hex[:8]}"),
        )
        cur.execute(
            "INSERT INTO app.tenants (tenant_id, name) VALUES (%s::uuid, %s)",
            (str(other_tenant), "phase1-tenant-other"),
        )
        cur.execute(
            "INSERT INTO business (business_id, tenant_id, name, slug) VALUES (%s::uuid, %s::uuid, %s, %s)",
            (str(test_business), str(test_tenant), "phase1-test", f"phase1-test-{test_business.hex[:8]}"),
        )
        cur.execute(
            "INSERT INTO app.businesses (business_id, tenant_id, name, slug) VALUES (%s::uuid, %s::uuid, %s, %s)",
            (str(test_business), str(test_tenant), "phase1-test", f"phase1-test-{test_business.hex[:8]}"),
        )
        cur.execute(
            "INSERT INTO business (business_id, tenant_id, name, slug) VALUES (%s::uuid, %s::uuid, %s, %s)",
            (str(other_business), str(other_tenant), "phase1-other", f"phase1-other-{other_business.hex[:8]}"),
        )
        cur.execute(
            "INSERT INTO app.businesses (business_id, tenant_id, name, slug) VALUES (%s::uuid, %s::uuid, %s, %s)",
            (str(other_business), str(other_tenant), "phase1-other", f"phase1-other-{other_business.hex[:8]}"),
        )
        cur.execute(
            "INSERT INTO app.environments (env_id, slug, client_name, industry, business_id) "
            "VALUES (%s::uuid, %s, %s, %s, %s::uuid)",
            (str(test_env), f"legal-phase1-{test_env.hex[:8]}", "Phase 1 Legal KB Test",
             "internal-test", str(test_business)),
        )
        cur.execute(
            "INSERT INTO app.environments (env_id, slug, client_name, industry, business_id) "
            "VALUES (%s::uuid, %s, %s, %s, %s::uuid)",
            (str(other_env), f"legal-phase1-other-{other_env.hex[:8]}",
             "Phase 1 Isolation Sentinel", "internal-test", str(other_business)),
        )

    try:
        yield {
            "test_env": test_env, "test_business": test_business, "test_tenant": test_tenant,
            "other_env": other_env, "other_business": other_business, "other_tenant": other_tenant,
        }
    finally:
        with _live_cursor() as cur:
            cur.execute(
                "DELETE FROM app.environments WHERE env_id IN (%s::uuid, %s::uuid)",
                (str(test_env), str(other_env)),
            )
            cur.execute(
                "DELETE FROM business WHERE business_id IN (%s::uuid, %s::uuid)",
                (str(test_business), str(other_business)),
            )
            cur.execute(
                "DELETE FROM app.businesses WHERE business_id IN (%s::uuid, %s::uuid)",
                (str(test_business), str(other_business)),
            )
            cur.execute(
                "DELETE FROM tenant WHERE tenant_id IN (%s::uuid, %s::uuid)",
                (str(test_tenant), str(other_tenant)),
            )
            cur.execute(
                "DELETE FROM app.tenants WHERE tenant_id IN (%s::uuid, %s::uuid)",
                (str(test_tenant), str(other_tenant)),
            )
        conn.close()


@integration
def test_seed_kb_demo_idempotent(live_legal_env):
    env_id = live_legal_env["test_env"]
    business_id = live_legal_env["test_business"]

    seed1 = svc.seed_kb_demo(env_id=env_id, business_id=business_id)
    assert seed1["seeded"] is True
    assert len(seed1["playbooks"]) == 3

    seed2 = svc.seed_kb_demo(env_id=env_id, business_id=business_id)
    assert seed2["seeded"] is False
    assert seed2["reason"] == "already_seeded"


@integration
def test_seed_produces_expected_counts(live_legal_env):
    env_id = live_legal_env["test_env"]
    business_id = live_legal_env["test_business"]
    svc.seed_kb_demo(env_id=env_id, business_id=business_id)

    assert len(svc.list_playbooks(env_id=env_id, business_id=business_id)) == 3
    assert len(svc.list_clauses(env_id=env_id, business_id=business_id)) == 12
    assert len(svc.list_approval_rules(env_id=env_id, business_id=business_id)) == 4
    assert len(svc.list_approvers(env_id=env_id, business_id=business_id)) == 8
    assert len(svc.list_prior_decisions(env_id=env_id, business_id=business_id)) == 6
    assert len(svc.list_policy_sources(env_id=env_id, business_id=business_id)) == 4


@integration
def test_prior_decision_filters(live_legal_env):
    env_id = live_legal_env["test_env"]
    business_id = live_legal_env["test_business"]
    svc.seed_kb_demo(env_id=env_id, business_id=business_id)

    nda = svc.list_prior_decisions(env_id=env_id, business_id=business_id, contract_type="NDA")
    assert len(nda) == 2
    assert all(d["contract_type"] == "NDA" for d in nda)

    one = svc.list_prior_decisions(
        env_id=env_id, business_id=business_id,
        contract_type="MSA", clause_key="liability_cap",
    )
    assert len(one) == 1
    assert one[0]["contract_type"] == "MSA"
    assert one[0]["clause_key"] == "liability_cap"


@integration
def test_cross_env_isolation(live_legal_env):
    test_env = live_legal_env["test_env"]
    test_business = live_legal_env["test_business"]
    other_env = live_legal_env["other_env"]
    other_business = live_legal_env["other_business"]

    svc.seed_kb_demo(env_id=test_env, business_id=test_business)

    # Sentinel env sees nothing.
    assert svc.list_playbooks(env_id=other_env, business_id=other_business) == []
    assert svc.list_clauses(env_id=other_env, business_id=other_business) == []
    assert svc.list_approval_rules(env_id=other_env, business_id=other_business) == []
    assert svc.list_prior_decisions(env_id=other_env, business_id=other_business) == []
    assert svc.list_policy_sources(env_id=other_env, business_id=other_business) == []
    assert svc.list_approvers(env_id=other_env, business_id=other_business) == []


@integration
def test_business_id_scoping_inside_env(live_legal_env):
    """business_id filter must hide rows even when env_id matches."""
    test_env = live_legal_env["test_env"]
    test_business = live_legal_env["test_business"]
    other_business = live_legal_env["other_business"]
    svc.seed_kb_demo(env_id=test_env, business_id=test_business)

    cross = svc.list_clauses(env_id=test_env, business_id=other_business)
    assert cross == []


@integration
def test_create_clause_does_not_leak_to_other_env(live_legal_env):
    test_env = live_legal_env["test_env"]
    test_business = live_legal_env["test_business"]
    other_env = live_legal_env["other_env"]
    other_business = live_legal_env["other_business"]
    svc.seed_kb_demo(env_id=test_env, business_id=test_business)

    before_test = len(svc.list_clauses(env_id=test_env, business_id=test_business))
    before_other = len(svc.list_clauses(env_id=other_env, business_id=other_business))

    created = svc.create_clause(
        env_id=test_env, business_id=test_business,
        payload={
            "clause_key": "smoke_test_clause",
            "clause_label": "Smoke Test Clause",
            "canonical_text": "Created by integration test.",
            "tags_json": ["smoke"],
            "jurisdiction": "US",
            "created_by": "phase1-integration-test",
        },
    )
    assert created["clause_key"] == "smoke_test_clause"

    after_test = len(svc.list_clauses(env_id=test_env, business_id=test_business))
    after_other = len(svc.list_clauses(env_id=other_env, business_id=other_business))
    assert after_test == before_test + 1
    assert after_other == before_other  # no leak


@integration
def test_playbook_positions_seeded_per_playbook(live_legal_env):
    env_id = live_legal_env["test_env"]
    business_id = live_legal_env["test_business"]
    svc.seed_kb_demo(env_id=env_id, business_id=business_id)

    playbooks = svc.list_playbooks(env_id=env_id, business_id=business_id)
    nda = next(p for p in playbooks if p["contract_type"] == "NDA")
    positions = svc.list_playbook_positions(
        env_id=env_id, business_id=business_id,
        playbook_id=UUID(str(nda["playbook_id"])),
    )
    # NDA seed defines 7 positions
    assert len(positions) == 7
    keys = {p["clause_key"] for p in positions}
    assert "term_of_confidentiality" in keys
    assert "permitted_use" in keys
