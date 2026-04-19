from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from tests.conftest import FakeCursor


def _make_fake_cursor(cur: FakeCursor):
    @contextmanager
    def _mock():
        yield cur

    return _mock


def test_get_authoritative_state_returns_missing_when_no_released_snapshot():
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result([])

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        payload = re_authoritative_snapshots.get_authoritative_state(
            entity_type="fund",
            entity_id=uuid4(),
            quarter="2026Q2",
        )

    assert payload["trust_status"] == "missing_source"
    assert payload["null_reason"] == "authoritative_state_not_released"
    assert payload["state"] is None
    # Phase 1 contract additions
    assert payload["period_exact"] is False
    assert payload["state_origin"] == "fallback"
    assert payload["requested_quarter"] == "2026Q2"


def test_get_authoritative_state_attaches_gross_to_net_bridge_for_fund():
    from app.services import re_authoritative_snapshots

    audit_run_id = uuid4()
    fund_id = uuid4()
    cur = FakeCursor()
    cur.push_result(
        [
            {
                "audit_run_id": audit_run_id,
                "snapshot_version": "meridian-20260409T120000Z-abcd1234",
                "quarter": "2026Q2",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "period_start": date(2026, 4, 1),
                "period_end": date(2026, 6, 30),
                "canonical_metrics": {"gross_irr": "0.14", "ending_nav": "1250000"},
                "display_metrics": {"gross_irr_pct": "14.0"},
                "null_reasons": {},
                "formulas": {"gross_irr": "gross IRR = XIRR(...)"},
                "provenance": [{"table": "re_cash_event"}],
                "artifact_paths": {"state_json": "/tmp/fund.json"},
            }
        ]
    )
    cur.push_result(
        [
            {
                "audit_run_id": audit_run_id,
                "snapshot_version": "meridian-20260409T120000Z-abcd1234",
                "quarter": "2026Q2",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "gross_return_amount": "100000",
                "management_fees": "10000",
                "fund_expenses": "5000",
                "net_return_amount": "85000",
                "bridge_items": [{"code": "gross_operating_cash_flow", "amount": "100000"}],
                "null_reasons": {},
                "formulas": {"net_return_amount": "gross - fees - expenses"},
                "provenance": [{"table": "re_fee_accrual_qtr"}],
                "artifact_paths": {"bridge_csv": "/tmp/bridge.csv"},
            }
        ]
    )

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        payload = re_authoritative_snapshots.get_authoritative_state(
            entity_type="fund",
            entity_id=fund_id,
            quarter="2026Q2",
        )

    bridge = payload["state"]["gross_to_net_bridge"]
    assert payload["trust_status"] == "trusted"
    assert bridge["gross_return_amount"] == "100000"
    assert bridge["management_fees"] == "10000"
    assert bridge["net_return_amount"] == "85000"
    # Phase 1 contract additions
    assert payload["period_exact"] is True
    assert payload["state_origin"] == "authoritative"
    assert payload["requested_quarter"] == "2026Q2"
    assert payload["quarter"] == "2026Q2"


def test_get_authoritative_state_period_exact_false_when_quarter_drift():
    """Defensive: even if a future SELECT returns a row whose quarter
    column does not match the requested quarter, period_exact must be False."""
    from app.services import re_authoritative_snapshots

    audit_run_id = uuid4()
    cur = FakeCursor()
    cur.push_result(
        [
            {
                "audit_run_id": audit_run_id,
                "snapshot_version": "meridian-test",
                "quarter": "2025Q4",  # drift: returned quarter != requested
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "period_start": date(2025, 10, 1),
                "period_end": date(2025, 12, 31),
                "canonical_metrics": {"gross_irr": "0.10"},
                "display_metrics": {},
                "null_reasons": {},
                "formulas": {},
                "provenance": [],
                "artifact_paths": {},
            }
        ]
    )
    # Investment / asset entity types do not call the bridge fetch.
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        payload = re_authoritative_snapshots.get_authoritative_state(
            entity_type="investment",
            entity_id=uuid4(),
            quarter="2026Q2",
        )

    assert payload["period_exact"] is False
    assert payload["state_origin"] == "authoritative"
    assert payload["quarter"] == "2025Q4"
    assert payload["requested_quarter"] == "2026Q2"


def test_get_fund_gross_to_net_bridge_period_exact_when_missing():
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result([])

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        payload = re_authoritative_snapshots.get_fund_gross_to_net_bridge(
            fund_id=uuid4(),
            quarter="2026Q2",
        )

    assert payload["null_reason"] == "authoritative_state_not_released"
    assert payload["period_exact"] is False
    assert payload["state_origin"] == "fallback"
    assert payload["requested_quarter"] == "2026Q2"


def test_released_state_lock_returns_version_when_released_snapshot_exists():
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result([{"snapshot_version": "meridian-test-version"}])

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        version = re_authoritative_snapshots.released_state_lock(
            entity_type="fund",
            entity_id=uuid4(),
            quarter="2025Q4",
        )

    assert version == "meridian-test-version"


def test_released_state_lock_returns_none_when_no_snapshot():
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result([])

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        version = re_authoritative_snapshots.released_state_lock(
            entity_type="fund",
            entity_id=uuid4(),
            quarter="2025Q4",
        )

    assert version is None


def test_assert_released_state_lock_raises_on_locked_period():
    import pytest

    from app.services import re_authoritative_snapshots
    from app.services.re_authoritative_snapshots import StateLockViolation

    cur = FakeCursor()
    cur.push_result([{"snapshot_version": "meridian-test-version"}])

    fund_id = uuid4()
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        with pytest.raises(StateLockViolation) as excinfo:
            re_authoritative_snapshots.assert_released_state_lock(
                entity_type="fund",
                entity_id=fund_id,
                quarter="2025Q4",
            )

    assert excinfo.value.snapshot_version == "meridian-test-version"
    assert excinfo.value.entity_type == "fund"
    assert excinfo.value.quarter == "2025Q4"


def test_get_released_portfolio_kpis_includes_snapshot_metadata():
    from app.services import re_authoritative_snapshots

    audit_run_id = uuid4()
    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": str(uuid4()),
                "audit_run_id": str(audit_run_id),
                "snapshot_version": "meridian-20260409T120000Z-abcd1234",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "canonical_metrics": {
                    "ending_nav": "1200",
                    "total_committed": "2000",
                    "asset_count": 3,
                    "gross_irr": "0.12",
                    "net_irr": "0.10",
                },
                "null_reasons": {},
                "provenance": [{"table": "re_authoritative_fund_state_qtr"}],
                "artifact_paths": {"state_json": "/tmp/f1.json"},
            },
            {
                "fund_id": str(uuid4()),
                "audit_run_id": str(audit_run_id),
                "snapshot_version": "meridian-20260409T120000Z-abcd1234",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "canonical_metrics": {
                    "ending_nav": "800",
                    "total_committed": "1000",
                    "asset_count": 2,
                    "gross_irr": "0.08",
                    "net_irr": "0.06",
                },
                "null_reasons": {},
                "provenance": [{"table": "re_authoritative_fund_state_qtr"}],
                "artifact_paths": {"state_json": "/tmp/f2.json"},
            },
        ]
    )

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        payload = re_authoritative_snapshots.get_released_portfolio_kpis(
            env_id=uuid4(),
            business_id=uuid4(),
            quarter="2026Q2",
        )

    assert payload["trust_status"] == "trusted"
    assert payload["snapshot_version"] == "meridian-20260409T120000Z-abcd1234"
    assert payload["audit_run_id"] == str(audit_run_id)
    assert payload["promotion_state"] == "released"
    assert payload["fund_count"] == 2
    assert payload["portfolio_nav"] == "2000"
    assert len(payload["source_snapshots"]) == 2


# ── Phase 3a: Trust-field contract ──────────────────────────────────────
# Runner emits irr_trust_state / net_irr_trust_state / dscr_trust_state +
# their reasons on every fund snapshot. These tests pin the contract:
#   1. The pure derivation helper produces the right shape and values.
#   2. The fields round-trip unmodified through the read path.


def test_derive_fund_trust_fields_all_present():
    """Both IRR values present → both trusted, DSCR always unavailable."""
    import sys
    from decimal import Decimal
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))
    from verification.runners.meridian_authoritative_snapshot import (
        derive_fund_trust_fields,
    )

    fields = derive_fund_trust_fields(
        gross_irr=Decimal("0.15"),
        net_irr=Decimal("0.12"),
    )
    assert fields == {
        "irr_trust_state": "trusted",
        "irr_reason": None,
        "net_irr_trust_state": "trusted",
        "net_irr_reason": None,
        "dscr_trust_state": "unavailable",
        "dscr_reason": "dscr_not_computed_at_fund_level",
    }


def test_derive_fund_trust_fields_net_irr_missing():
    """Below-hurdle funds / missing waterfall → net trust = unavailable."""
    import sys
    from decimal import Decimal
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))
    from verification.runners.meridian_authoritative_snapshot import (
        derive_fund_trust_fields,
    )

    fields = derive_fund_trust_fields(
        gross_irr=Decimal("0.05"),
        net_irr=None,
    )
    assert fields["irr_trust_state"] == "trusted"
    assert fields["irr_reason"] is None
    assert fields["net_irr_trust_state"] == "unavailable"
    assert fields["net_irr_reason"] == "metric_not_computed"


def test_derive_fund_trust_fields_both_missing():
    """Gross IRR uncomputable (e.g. no cash events) → both unavailable."""
    import sys
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))
    from verification.runners.meridian_authoritative_snapshot import (
        derive_fund_trust_fields,
    )

    fields = derive_fund_trust_fields(gross_irr=None, net_irr=None)
    assert fields["irr_trust_state"] == "unavailable"
    assert fields["irr_reason"] == "metric_not_computed"
    assert fields["net_irr_trust_state"] == "unavailable"
    assert fields["net_irr_reason"] == "metric_not_computed"


def test_trust_fields_round_trip_through_read_path():
    """A snapshot row with all 6 trust fields must come back unmodified."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "audit_run_id": uuid4(),
                "snapshot_version": "meridian-test-trust",
                "quarter": "2026Q2",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "period_start": date(2026, 4, 1),
                "period_end": date(2026, 6, 30),
                "canonical_metrics": {
                    "gross_irr": "0.14",
                    "net_irr": "0.11",
                    "ending_nav": "1000000",
                    "irr_trust_state": "trusted",
                    "irr_reason": None,
                    "net_irr_trust_state": "trusted",
                    "net_irr_reason": None,
                    "dscr_trust_state": "unavailable",
                    "dscr_reason": "dscr_not_computed_at_fund_level",
                },
                "display_metrics": {},
                "null_reasons": {},
                "formulas": {},
                "provenance": [],
                "artifact_paths": {},
            }
        ]
    )
    # Investment entity type skips the bridge fetch (only one cur.push_result needed).
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        payload = re_authoritative_snapshots.get_authoritative_state(
            entity_type="investment",
            entity_id=uuid4(),
            quarter="2026Q2",
        )

    cm = payload["state"]["canonical_metrics"]
    assert cm["irr_trust_state"] == "trusted"
    assert cm["irr_reason"] is None
    assert cm["net_irr_trust_state"] == "trusted"
    assert cm["net_irr_reason"] is None
    assert cm["dscr_trust_state"] == "unavailable"
    assert cm["dscr_reason"] == "dscr_not_computed_at_fund_level"


# ── Phase 3c: Batched portfolio authoritative-states contract ──────────


def test_get_portfolio_authoritative_states_returns_per_fund_payload():
    """Batched fetch returns one authoritative-state dict per fund, trust
    fields preserved, shape matches per-fund get_authoritative_state."""
    from app.services import re_authoritative_snapshots

    fund_a = uuid4()
    fund_b = uuid4()
    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": str(fund_a),
                "audit_run_id": str(uuid4()),
                "snapshot_version": "meridian-test-a",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "quarter": "2026Q2",
                "period_start": date(2026, 4, 1),
                "period_end": date(2026, 6, 30),
                "canonical_metrics": {
                    "gross_irr": "0.12",
                    "irr_trust_state": "trusted",
                    "irr_reason": None,
                    "net_irr_trust_state": "trusted",
                    "net_irr_reason": None,
                    "dscr_trust_state": "unavailable",
                    "dscr_reason": "dscr_not_computed_at_fund_level",
                },
                "display_metrics": {},
                "null_reasons": {},
                "formulas": {},
                "provenance": [],
                "artifact_paths": {},
            },
            {
                "fund_id": str(fund_b),
                "audit_run_id": str(uuid4()),
                "snapshot_version": "meridian-test-b",
                "promotion_state": "released",
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "quarter": "2026Q2",
                "period_start": date(2026, 4, 1),
                "period_end": date(2026, 6, 30),
                "canonical_metrics": {
                    "gross_irr": "0.05",
                    "net_irr": None,
                    "irr_trust_state": "trusted",
                    "irr_reason": None,
                    "net_irr_trust_state": "unavailable",
                    "net_irr_reason": "metric_not_computed",
                    "dscr_trust_state": "unavailable",
                    "dscr_reason": "dscr_not_computed_at_fund_level",
                },
                "display_metrics": {},
                "null_reasons": {},
                "formulas": {},
                "provenance": [],
                "artifact_paths": {},
            },
        ]
    )

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.get_portfolio_authoritative_states(
            env_id=uuid4(),
            business_id=uuid4(),
            quarter="2026Q2",
        )

    assert isinstance(out, list)
    assert len(out) == 2
    # Shape matches per-fund get_authoritative_state
    for entry in out:
        assert entry["entity_type"] == "fund"
        assert entry["promotion_state"] == "released"
        assert entry["period_exact"] is True
        assert entry["state_origin"] == "authoritative"
        assert "state" in entry
        assert "canonical_metrics" in entry["state"]
        # Trust fields survived the round-trip
        cm = entry["state"]["canonical_metrics"]
        assert "irr_trust_state" in cm
        assert "dscr_trust_state" in cm

    # Per-fund differences preserved
    assert out[0]["state"]["canonical_metrics"]["net_irr_trust_state"] == "trusted"
    assert out[1]["state"]["canonical_metrics"]["net_irr_trust_state"] == "unavailable"


def test_get_portfolio_authoritative_states_empty_env_returns_empty_list():
    """Env with no released snapshots → empty list, no exception."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result([])

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.get_portfolio_authoritative_states(
            env_id=uuid4(),
            business_id=uuid4(),
            quarter="2026Q2",
        )

    assert out == []


# ── Phase 4: Promotion gate ────────────────────────────────────────────


def test_validate_snapshot_for_release_all_funds_trusted_passes():
    """Gate allows promotion when every fund has gross_irr + trusted state."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": str(uuid4()),
                "canonical_metrics": {
                    "gross_irr": "0.14",
                    "irr_trust_state": "trusted",
                    "net_irr_trust_state": "trusted",
                },
                "null_reason": None,
            },
            {
                "fund_id": str(uuid4()),
                "canonical_metrics": {
                    "gross_irr": "0.05",
                    "irr_trust_state": "trusted",
                    "net_irr_trust_state": "unavailable",  # below-hurdle — does NOT block
                    "net_irr_reason": "metric_not_computed",
                },
                "null_reason": None,
            },
        ]
    )
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.validate_snapshot_for_release(
            snapshot_version="test-v1",
        )
    assert out["ok"] is True
    assert out["violations"] == []
    assert out["fund_count_scanned"] == 2


def test_validate_snapshot_for_release_missing_gross_irr_blocks():
    """Gate blocks when a fund has no gross_irr at all."""
    from app.services import re_authoritative_snapshots

    bad_fund = str(uuid4())
    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": bad_fund,
                "canonical_metrics": {"irr_trust_state": "trusted"},  # no gross_irr
                "null_reason": None,
            },
        ]
    )
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.validate_snapshot_for_release(
            snapshot_version="test-v2",
        )
    assert out["ok"] is False
    assert len(out["violations"]) == 1
    assert out["violations"][0]["fund_id"] == bad_fund
    assert out["violations"][0]["reason"] == "missing_gross_irr"


def test_validate_snapshot_for_release_untrusted_irr_blocks_with_reason():
    """Gate blocks when irr_trust_state is not 'trusted' and surfaces irr_reason."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": str(uuid4()),
                "canonical_metrics": {
                    "gross_irr": "0.14",
                    "irr_trust_state": "suspect",
                    "irr_reason": "cash_events_under_review",
                },
                "null_reason": None,
            },
        ]
    )
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.validate_snapshot_for_release(
            snapshot_version="test-v3",
        )
    assert out["ok"] is False
    assert out["violations"][0]["reason"] == "irr_untrusted:cash_events_under_review"


def test_validate_snapshot_for_release_top_null_reason_blocks():
    """Gate blocks when the fund row carries a top-level null_reason."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": str(uuid4()),
                "canonical_metrics": {"gross_irr": "0.14", "irr_trust_state": "trusted"},
                "null_reason": "investigation_pending",
            },
        ]
    )
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.validate_snapshot_for_release(
            snapshot_version="test-v4",
        )
    assert out["ok"] is False
    assert out["violations"][0]["reason"] == "top_null_reason:investigation_pending"


def test_validate_snapshot_for_release_pre_3a_rows_pass_backward_compat():
    """Pre-Phase-3a rows don't carry irr_trust_state; gate should still pass
    as long as gross_irr is present and no top null_reason."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "fund_id": str(uuid4()),
                "canonical_metrics": {"gross_irr": "0.14"},  # no trust fields
                "null_reason": None,
            },
        ]
    )
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        out = re_authoritative_snapshots.validate_snapshot_for_release(
            snapshot_version="test-v5",
        )
    assert out["ok"] is True


def test_promote_snapshot_version_released_invokes_gate_and_raises_on_failure():
    """promote_snapshot_version(target='released') raises PromotionGateError
    before touching any table when the gate rejects the snapshot."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    # Only one SELECT needed — the gate short-circuits before any UPDATE.
    cur.push_result(
        [
            {
                "fund_id": str(uuid4()),
                "canonical_metrics": {},  # no gross_irr
                "null_reason": None,
            },
        ]
    )
    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        import pytest as _pytest
        with _pytest.raises(re_authoritative_snapshots.PromotionGateError) as exc_info:
            re_authoritative_snapshots.promote_snapshot_version(
                snapshot_version="test-v6",
                target_state="released",
                actor="test-actor",
            )
    assert "missing_gross_irr" in str(exc_info.value)


def test_promote_snapshot_version_verified_target_bypasses_gate():
    """Promotion to 'verified' never invokes the gate — only release enforces it."""
    from app.services import re_authoritative_snapshots

    cur = FakeCursor()
    # Mimic the run row lookup + 4 table updates (5 results total).
    cur.push_result(
        [{"audit_run_id": str(uuid4()), "run_status": "draft_audit"}],
    )
    for _ in range(5):  # UPDATE run + 4 table updates
        cur.push_result([])

    with patch("app.services.re_authoritative_snapshots.get_cursor", _make_fake_cursor(cur)):
        # Should not raise even though canonical_metrics is not validated.
        re_authoritative_snapshots.promote_snapshot_version(
            snapshot_version="test-v7",
            target_state="verified",
            actor="test-actor",
        )
