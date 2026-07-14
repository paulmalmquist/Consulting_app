"""Tests for ``re_sustainability_snapshot_writer`` (plan 0018 T13a).

These tests monkeypatch ``get_cursor`` so no real database is required.
They verify the invariants the writer must uphold to work with the T3
triggers (schema in ``repo-b/db/schema/618_sus_authoritative.sql``):

- ``create_snapshot`` writes a ``draft_audit`` header and is idempotent on
  ``snapshot_version``.
- ``persist_metric_values`` enforces the value/null invariant so a legitimate
  measured zero stays distinguishable from an unavailable metric.
- ``validate_snapshot_for_release`` refuses a snapshot with no metrics or
  with any valued metric that has no evidence.
- ``promote_snapshot`` gates the release path and refuses an invalid
  transition rather than relying on the DB trigger alone.
"""

from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal
from uuid import uuid4

import pytest

from tests.conftest import FakeCursor


def _fake_cursor_ctx(cur: FakeCursor):
    @contextmanager
    def _mock():
        yield cur

    return _mock


def test_create_snapshot_writes_draft_header_and_is_idempotent(monkeypatch):
    from app.services import re_sustainability_snapshot_writer as writer

    business_id = uuid4()
    cur = FakeCursor()
    # First call: RETURNING yields the row (fresh insert).
    cur.push_result([{"snapshot_version": "sus-20260714T000000Z-t13a0001"}])
    # Second call: ON CONFLICT DO NOTHING => no RETURNING row.
    cur.push_result([])

    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur))

    first = writer.create_snapshot(
        business_id=business_id,
        env_id="env-demo",
        entity_scope="portfolio",
        period_key="2026Q2",
        metric_family="emissions",
        snapshot_version="sus-20260714T000000Z-t13a0001",
        state_origin="materialized",
        formula_id="sus.snapshot.v1",
        input_hash="sha256:deadbeef",
        period_exact=True,
        trust_status="trusted",
        created_by="t13a-writer",
    )
    assert first == "sus-20260714T000000Z-t13a0001"

    sql_first, params_first = cur.queries[0]
    assert "INSERT INTO sus_authoritative_snapshots" in sql_first
    assert "'draft_audit'" in sql_first
    assert "ON CONFLICT (snapshot_version) DO NOTHING" in sql_first
    # entity_scope is passed positionally after env_id/business_id.
    assert "portfolio" in params_first

    second = writer.create_snapshot(
        business_id=business_id,
        env_id="env-demo",
        entity_scope="portfolio",
        period_key="2026Q2",
        metric_family="emissions",
        snapshot_version="sus-20260714T000000Z-t13a0001",
    )
    # No exception on repeat; returns the same version.
    assert second == "sus-20260714T000000Z-t13a0001"
    # Two INSERTs were attempted (idempotency is at the DB layer, not skipped
    # in Python) — both use ON CONFLICT DO NOTHING.
    assert len(cur.queries) == 2


def test_persist_metric_values_accepts_zero_and_null_reason_but_not_both_or_neither(monkeypatch):
    from app.services import re_sustainability_snapshot_writer as writer

    business_id = uuid4()

    # Case 1: value=0 with null_reason=None (legitimate measured zero) — accept.
    cur_ok = FakeCursor()
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_ok))
    inserted = writer.persist_metric_values(
        snapshot_version="sv-1",
        values=[
            {
                "env_id": "env-demo",
                "business_id": business_id,
                "metric_key": "scope_1_emissions_tco2e",
                "value_numeric": Decimal("0"),
                "unit": "tCO2e",
                "null_reason": None,
                "trust_status": "trusted",
            },
            {
                "env_id": "env-demo",
                "business_id": business_id,
                "metric_key": "scope_3_emissions_tco2e",
                "value_numeric": None,
                "unit": "tCO2e",
                "null_reason": "source_not_reported",
                "trust_status": "missing_source",
            },
        ],
    )
    assert inserted == 2
    inserts = [q for q in cur_ok.queries if "INSERT INTO sus_authoritative_metric_value" in q[0]]
    assert len(inserts) == 2
    # The measured-zero row must have persisted value_numeric='0' and null_reason=None
    # so downstream readers can distinguish a real zero from an unavailable metric.
    # Param order matches the INSERT: (snapshot_version, env_id, business_id, metric_key,
    #                                  value_numeric, unit, null_reason, trust_status)
    zero_params = inserts[0][1]
    assert zero_params[4] == "0"
    assert zero_params[6] is None
    # And the unavailable-metric row carries a null_reason with value_numeric=None.
    unavailable_params = inserts[1][1]
    assert unavailable_params[4] is None
    assert unavailable_params[6] == "source_not_reported"

    # Case 2: value AND null_reason — reject.
    with pytest.raises(ValueError, match="both"):
        writer.persist_metric_values(
            snapshot_version="sv-1",
            values=[{
                "env_id": "env-demo",
                "business_id": business_id,
                "metric_key": "scope_1_emissions_tco2e",
                "value_numeric": Decimal("42"),
                "null_reason": "source_not_reported",
            }],
        )

    # Case 3: neither value nor null_reason — reject.
    with pytest.raises(ValueError, match="neither"):
        writer.persist_metric_values(
            snapshot_version="sv-1",
            values=[{
                "env_id": "env-demo",
                "business_id": business_id,
                "metric_key": "scope_1_emissions_tco2e",
                "value_numeric": None,
                "null_reason": None,
            }],
        )


def test_validate_snapshot_for_release_requires_metrics_and_evidence(monkeypatch):
    from app.services import re_sustainability_snapshot_writer as writer

    # (a) No metric rows at all => gate raises.
    cur_empty = FakeCursor()
    cur_empty.push_result([])  # metrics query
    cur_empty.push_result([])  # evidence query (unused; raises before)
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_empty))
    with pytest.raises(writer.SustainabilityPromotionGateError) as exc:
        writer.validate_snapshot_for_release(snapshot_version="sv-empty")
    assert any(v["reason"] == "no_metric_value_rows" for v in exc.value.violations)

    # (b) Valued metric with no matching evidence row => gate raises.
    cur_missing_ev = FakeCursor()
    cur_missing_ev.push_result([
        {
            "metric_key": "scope_1_emissions_tco2e",
            "value_numeric": Decimal("100"),
            "null_reason": None,
        },
    ])
    cur_missing_ev.push_result([])  # no evidence rows
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_missing_ev))
    with pytest.raises(writer.SustainabilityPromotionGateError) as exc2:
        writer.validate_snapshot_for_release(snapshot_version="sv-missing-ev")
    assert any(v["reason"] == "valued_metric_missing_evidence" for v in exc2.value.violations)

    # (c) All valued metrics have evidence => gate passes (returns None).
    cur_ok = FakeCursor()
    cur_ok.push_result([
        {
            "metric_key": "scope_1_emissions_tco2e",
            "value_numeric": Decimal("100"),
            "null_reason": None,
        },
        {
            "metric_key": "scope_3_emissions_tco2e",
            "value_numeric": None,
            "null_reason": "source_not_reported",
        },
    ])
    cur_ok.push_result([{"metric_key": "scope_1_emissions_tco2e"}])
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_ok))
    assert writer.validate_snapshot_for_release(snapshot_version="sv-ok") is None


def test_promote_snapshot_gates_release_and_refuses_invalid_transitions(monkeypatch):
    from app.services import re_sustainability_snapshot_writer as writer

    # Invalid transition: draft_audit -> released (must go through verified).
    cur_state = FakeCursor()
    cur_state.push_result([{"promotion_state": "draft_audit"}])
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_state))
    with pytest.raises(ValueError, match="verified"):
        writer.promote_snapshot(
            snapshot_version="sv-1", to_state="released", actor="tester"
        )

    # verified -> released with an ungated snapshot: gate must run and raise.
    cur_gate = FakeCursor()
    cur_gate.push_result([{"promotion_state": "verified"}])  # promote state check
    cur_gate.push_result([])  # gate: no metric rows
    cur_gate.push_result([])  # gate: no evidence rows (unused)
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_gate))
    with pytest.raises(writer.SustainabilityPromotionGateError):
        writer.promote_snapshot(
            snapshot_version="sv-1", to_state="released", actor="tester"
        )
    # The UPDATEs must not have been issued once the gate raised.
    assert not any("UPDATE sus_authoritative_snapshots" in q[0] for q in cur_gate.queries)

    # Backward transition: verified -> verified is not allowed either.
    cur_back = FakeCursor()
    cur_back.push_result([{"promotion_state": "verified"}])
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_back))
    with pytest.raises(ValueError, match="Invalid promotion transition"):
        writer.promote_snapshot(
            snapshot_version="sv-1", to_state="verified", actor="tester"
        )

    # Happy path: draft_audit -> verified issues the UPDATEs and no gate call.
    cur_ok = FakeCursor()
    cur_ok.push_result([{"promotion_state": "draft_audit"}])
    monkeypatch.setattr(writer, "get_cursor", _fake_cursor_ctx(cur_ok))
    result = writer.promote_snapshot(
        snapshot_version="sv-1", to_state="verified", actor="tester"
    )
    assert result == "verified"
    updates = [q for q in cur_ok.queries if q[0].strip().startswith("UPDATE")]
    assert any("sus_authoritative_snapshots" in q[0] for q in updates)
    assert any("sus_authoritative_metric_value" in q[0] for q in updates)
    assert any("verified_at" in q[0] for q in updates)
