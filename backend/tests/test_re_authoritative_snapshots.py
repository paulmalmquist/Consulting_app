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
