"""Invariant tests for the Operator Diagnostics service.

Covers the ten contract invariants described in the plan:

  1.  Authoritative lock preserved (released → state_origin=authoritative).
  2.  No hidden aggregation over re_authoritative_* (per-asset calls only).
  3.  Peer-set determinism across identical inputs.
  4.  Operator rollup exactness (avg equals rollup of visible rows).
  5.  Summary rollup exactness (released-only).
  6.  No partial peer math leakage (unreleased rows excluded from peer avg).
  7.  Period mismatch suppresses derived metrics.
  8.  Seed provenance surfaced in response + audit.
  9.  Insufficient peer sample suppresses peer Δ.
  10. No waterfall-dependent metrics touched.
"""
from __future__ import annotations

import os
import sys
import types
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    psycopg_stub.Connection = object
    psycopg_stub.rows = types.SimpleNamespace(dict_row=None)
    sys.modules["psycopg"] = psycopg_stub

if "dotenv" not in sys.modules:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = dotenv_stub


from app.services import re_operator_diagnostics  # noqa: E402


# ─────────────────────────────────────────────────────────────
# Fixture helpers
# ─────────────────────────────────────────────────────────────

ASSET_IDS = [
    f"00000000-0000-0000-0000-0000000000{i:02d}"
    for i in range(1, 10)
]


def _build_raw_asset(i: int, operator: str, acuity: str, market: str, units: int):
    return {
        "asset_id": ASSET_IDS[i],
        "name": f"Asset {i}",
        "units": units,
        "market": market,
        "property_type": "senior_housing",
    }


def _build_profile(asset_id: str, operator: str, acuity: str, size_band: str, *,
                   op_source: str = "seed", ac_source: str = "seed"):
    return {
        "asset_id": asset_id,
        "operator_name": operator,
        "operator_name_source": op_source,
        "acuity_type": acuity,
        "acuity_type_source": ac_source,
        "size_band": size_band,
    }


def _released_auth(quarter: str, noi: str, occ: str, version: str = "v1"):
    return {
        "entity_type": "asset",
        "entity_id": "",
        "quarter": quarter,
        "requested_quarter": quarter,
        "period_exact": True,
        "state_origin": "authoritative",
        "audit_run_id": "00000000-0000-0000-0000-000000000099",
        "snapshot_version": version,
        "promotion_state": "released",
        "trust_status": "trusted",
        "breakpoint_layer": None,
        "null_reason": None,
        "state": {
            "period_start": None,
            "period_end": None,
            "canonical_metrics": {"noi": noi, "occupancy": occ},
            "display_metrics": {},
        },
        "null_reasons": {},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }


def _missing_auth(quarter: str):
    return {
        "entity_type": "asset",
        "entity_id": "",
        "quarter": quarter,
        "requested_quarter": quarter,
        "period_exact": False,
        "state_origin": "fallback",
        "audit_run_id": None,
        "snapshot_version": None,
        "promotion_state": None,
        "trust_status": "missing_source",
        "breakpoint_layer": None,
        "null_reason": "authoritative_state_not_released",
        "state": None,
        "null_reasons": {"state": "authoritative_state_not_released"},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }


def _install_fixture(
    monkeypatch,
    *,
    assets_raw: list,
    profiles: dict,
    auth_map: dict,
    prior_auth_map: dict,
    operational: dict,
    auth_call_recorder: list | None = None,
    db_call_counter: dict | None = None,
):
    """Monkeypatch every external call in the service.

    Ensures tests never touch a real DB and lets us assert per-call shape.
    """

    def fake_list_assets(*, env_id, fund_id):
        if db_call_counter is not None:
            db_call_counter["list_assets"] = db_call_counter.get("list_assets", 0) + 1
        return assets_raw

    def fake_load_profiles(*, asset_ids, env_id):
        if db_call_counter is not None:
            db_call_counter["profiles"] = db_call_counter.get("profiles", 0) + 1
        return {aid: profiles.get(aid) for aid in asset_ids if profiles.get(aid)}

    def fake_operational(*, asset_ids, quarter):
        if db_call_counter is not None:
            db_call_counter["operational"] = db_call_counter.get("operational", 0) + 1
        return {aid: operational.get(aid) for aid in asset_ids if operational.get(aid)}

    def fake_get_authoritative_state(
        *, entity_type, entity_id, quarter, snapshot_version=None, audit_run_id=None
    ):
        if auth_call_recorder is not None:
            auth_call_recorder.append(
                {"entity_type": entity_type, "entity_id": str(entity_id), "quarter": quarter}
            )
        key = (str(entity_id), quarter)
        if key in auth_map:
            payload = dict(auth_map[key])
            payload["entity_id"] = str(entity_id)
            return payload
        if key in prior_auth_map:
            payload = dict(prior_auth_map[key])
            payload["entity_id"] = str(entity_id)
            return payload
        return _missing_auth(quarter)

    monkeypatch.setattr(
        re_operator_diagnostics, "_list_senior_housing_assets", fake_list_assets
    )
    monkeypatch.setattr(
        re_operator_diagnostics, "_load_profiles", fake_load_profiles
    )
    monkeypatch.setattr(
        re_operator_diagnostics, "_load_operational_rows", fake_operational
    )
    monkeypatch.setattr(
        re_operator_diagnostics.re_authoritative_snapshots,
        "get_authoritative_state",
        fake_get_authoritative_state,
    )


def _default_scenario():
    """Cohort: acuity=AL, market=Dallas, size_band=mid — 4 released assets (Brookdale x2, Atria x2)."""
    assets_raw = [
        _build_raw_asset(0, "Brookdale", "AL", "Dallas", 100),
        _build_raw_asset(1, "Brookdale", "AL", "Dallas", 110),
        _build_raw_asset(2, "Atria", "AL", "Dallas", 90),
        _build_raw_asset(3, "Atria", "AL", "Dallas", 85),
    ]
    profiles = {
        ASSET_IDS[0]: _build_profile(ASSET_IDS[0], "Brookdale", "AL", "mid"),
        ASSET_IDS[1]: _build_profile(ASSET_IDS[1], "Brookdale", "AL", "mid"),
        ASSET_IDS[2]: _build_profile(ASSET_IDS[2], "Atria", "AL", "mid"),
        ASSET_IDS[3]: _build_profile(ASSET_IDS[3], "Atria", "AL", "mid"),
    }
    quarter = "2026Q2"
    auth = {
        (ASSET_IDS[0], quarter): _released_auth(quarter, "300000", "0.92"),
        (ASSET_IDS[1], quarter): _released_auth(quarter, "330000", "0.93"),
        (ASSET_IDS[2], quarter): _released_auth(quarter, "360000", "0.95"),
        (ASSET_IDS[3], quarter): _released_auth(quarter, "380000", "0.94"),
    }
    prior_quarter = "2026Q1"
    prior_auth = {
        (ASSET_IDS[0], prior_quarter): _released_auth(prior_quarter, "290000", "0.91"),
        (ASSET_IDS[1], prior_quarter): _released_auth(prior_quarter, "320000", "0.93"),
        (ASSET_IDS[2], prior_quarter): _released_auth(prior_quarter, "350000", "0.95"),
        (ASSET_IDS[3], prior_quarter): _released_auth(prior_quarter, "375000", "0.93"),
    }
    operational = {
        ASSET_IDS[0]: {
            "asset_id": ASSET_IDS[0], "quarter": quarter,
            "revenue": Decimal("1000000"), "labor_cost": Decimal("480000"),
            "labor_cost_source": "seed", "source_type": "seed",
        },
        ASSET_IDS[1]: {
            "asset_id": ASSET_IDS[1], "quarter": quarter,
            "revenue": Decimal("1100000"), "labor_cost": Decimal("528000"),
            "labor_cost_source": "seed", "source_type": "seed",
        },
        ASSET_IDS[2]: {
            "asset_id": ASSET_IDS[2], "quarter": quarter,
            "revenue": Decimal("1200000"), "labor_cost": Decimal("504000"),
            "labor_cost_source": "seed", "source_type": "seed",
        },
        ASSET_IDS[3]: {
            "asset_id": ASSET_IDS[3], "quarter": quarter,
            "revenue": Decimal("1250000"), "labor_cost": Decimal("525000"),
            "labor_cost_source": "seed", "source_type": "seed",
        },
    }
    return assets_raw, profiles, auth, prior_auth, operational


# ─────────────────────────────────────────────────────────────
# Invariant 1 — authoritative lock preserved
# ─────────────────────────────────────────────────────────────

def test_released_rows_carry_authoritative_state_origin(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )

    out = re_operator_diagnostics.get_operator_diagnostics(
        env_id="env-1", quarter="2026Q2"
    )
    assert len(out["assets"]) == 4
    for row in out["assets"]:
        assert row["state_origin"] == "authoritative"
        assert row["period_exact"] is True
        assert row["noi"] is not None
        assert row["occupancy"] is not None
        assert row["snapshot_version"] == "v1"


def test_unreleased_row_returns_null_with_reason(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    # Drop one authoritative release → fallback
    del auth[(ASSET_IDS[0], "2026Q2")]
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )

    out = re_operator_diagnostics.get_operator_diagnostics(
        env_id="env-1", quarter="2026Q2"
    )
    missing = [r for r in out["assets"] if r["asset_id"] == ASSET_IDS[0]][0]
    assert missing["state_origin"] == "fallback"
    assert missing["noi"] is None
    assert missing["occupancy"] is None
    assert missing["noi_margin"] is None
    assert missing["null_reasons"]["noi"] == "authoritative_state_not_released"


# ─────────────────────────────────────────────────────────────
# Invariant 2 — no hidden aggregation
# ─────────────────────────────────────────────────────────────

def test_authoritative_called_once_per_asset(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    recorder: list = []
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
        auth_call_recorder=recorder,
    )
    re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    # One call per asset for current quarter + one per asset for prior quarter
    by_quarter: dict[str, int] = {}
    for call in recorder:
        by_quarter[call["quarter"]] = by_quarter.get(call["quarter"], 0) + 1
    assert by_quarter == {"2026Q2": 4, "2026Q1": 4}


# ─────────────────────────────────────────────────────────────
# Invariant 3 — peer-set determinism
# ─────────────────────────────────────────────────────────────

def test_peer_set_deterministic_across_calls(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out1 = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    out2 = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    for a1, a2 in zip(out1["assets"], out2["assets"]):
        assert a1["peer_set"] == a2["peer_set"]
        assert a1["peer_margin_delta"] == a2["peer_margin_delta"]


# ─────────────────────────────────────────────────────────────
# Invariant 4 — operator rollup exactness
# ─────────────────────────────────────────────────────────────

def test_operator_avg_equals_rollup_of_visible_assets(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    by_op: dict[str, list[Decimal]] = {}
    for r in out["assets"]:
        if r["noi_margin"] is not None:
            by_op.setdefault(r["operator_name"], []).append(Decimal(r["noi_margin"]))

    for op in out["operators"]:
        xs = by_op.get(op["operator_name"], [])
        if xs:
            expected = sum(xs) / Decimal(len(xs))
            assert Decimal(op["avg_noi_margin"]) == expected


# ─────────────────────────────────────────────────────────────
# Invariant 5 — summary rollup exactness (released only)
# ─────────────────────────────────────────────────────────────

def test_summary_avg_uses_released_only(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    # Make one asset unreleased — summary should ignore it.
    del auth[(ASSET_IDS[3], "2026Q2")]
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    released = [r for r in out["assets"] if r["state_origin"] == "authoritative"]
    margins = [Decimal(r["noi_margin"]) for r in released if r["noi_margin"] is not None]
    expected = sum(margins) / Decimal(len(margins))
    assert Decimal(out["summary"]["avg_noi_margin"]) == expected
    assert out["summary"]["released_count"] == 3


# ─────────────────────────────────────────────────────────────
# Invariant 6 — no partial peer math leakage
# ─────────────────────────────────────────────────────────────

def test_unreleased_row_never_contributes_to_peer_avg(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    del auth[(ASSET_IDS[0], "2026Q2")]
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    # Unreleased row
    missing = [r for r in out["assets"] if r["asset_id"] == ASSET_IDS[0]][0]
    assert missing["peer_margin_delta"] is None
    assert missing["null_reasons"]["peer_margin_delta"] == "asset_not_released_or_margin_missing"


# ─────────────────────────────────────────────────────────────
# Invariant 7 — period mismatch suppresses derived metrics
# ─────────────────────────────────────────────────────────────

def test_period_mismatch_suppresses_derived(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    # Operational row at wrong quarter
    operational[ASSET_IDS[0]] = {
        "asset_id": ASSET_IDS[0], "quarter": "2026Q1",
        "revenue": Decimal("1000000"), "labor_cost": Decimal("480000"),
        "labor_cost_source": "seed", "source_type": "seed",
    }
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    row = [r for r in out["assets"] if r["asset_id"] == ASSET_IDS[0]][0]
    assert row["revenue"] is None
    assert row["noi_margin"] is None
    assert row["labor_intensity"] is None
    assert row["null_reasons"]["revenue"] == "operational_period_mismatch"
    assert row["null_reasons"]["noi_margin"] == "operational_period_mismatch"


# ─────────────────────────────────────────────────────────────
# Invariant 8 — seed provenance surfaced
# ─────────────────────────────────────────────────────────────

def test_seed_provenance_surfaced_in_row_and_audit(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    row = out["assets"][0]
    assert row["sources"]["operator_name_source"] == "seed"
    assert row["sources"]["labor_cost_source"] == "seed"
    assert out["audit"]["demo_seed_present"] is True
    # Source provenance counts contain a seed bucket for operator_name
    op_sources = out["audit"]["source_provenance_counts"].get("operator_name_source", {})
    assert op_sources.get("seed", 0) == 4


# ─────────────────────────────────────────────────────────────
# Invariant 9 — insufficient peer sample
# ─────────────────────────────────────────────────────────────

def test_insufficient_peer_sample_suppresses_delta(monkeypatch):
    # Only 2 released peers in same cohort (Brookdale x2 AL/Dallas/mid)
    assets_raw = [
        _build_raw_asset(0, "Brookdale", "AL", "Dallas", 100),
        _build_raw_asset(1, "Brookdale", "AL", "Dallas", 110),
    ]
    profiles = {
        ASSET_IDS[0]: _build_profile(ASSET_IDS[0], "Brookdale", "AL", "mid"),
        ASSET_IDS[1]: _build_profile(ASSET_IDS[1], "Brookdale", "AL", "mid"),
    }
    quarter = "2026Q2"
    auth = {
        (ASSET_IDS[0], quarter): _released_auth(quarter, "300000", "0.92"),
        (ASSET_IDS[1], quarter): _released_auth(quarter, "330000", "0.93"),
    }
    prior_auth: dict = {}
    operational = {
        ASSET_IDS[0]: {
            "asset_id": ASSET_IDS[0], "quarter": quarter,
            "revenue": Decimal("1000000"), "labor_cost": Decimal("480000"),
            "labor_cost_source": "seed", "source_type": "seed",
        },
        ASSET_IDS[1]: {
            "asset_id": ASSET_IDS[1], "quarter": quarter,
            "revenue": Decimal("1100000"), "labor_cost": Decimal("528000"),
            "labor_cost_source": "seed", "source_type": "seed",
        },
    }
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    for row in out["assets"]:
        assert row["peer_margin_delta"] is None
        assert row["null_reasons"]["peer_margin_delta"] == "insufficient_peer_sample"


# ─────────────────────────────────────────────────────────────
# Invariant 9b — peer math is NOT narrowed by UI display filters
# ─────────────────────────────────────────────────────────────


def test_peer_deltas_stable_across_display_filters(monkeypatch):
    """A visible asset's peer_margin_delta must match what it was unfiltered.

    If display filters leaked into peer math, applying operator=Brookdale to
    a cohort of 4 (Brookdale x2 + Atria x2) would crash peer_count from 3 to 1
    and peer deltas would differ. The service must use the full unfiltered
    cohort for peer math regardless of UI filters.
    """
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    unfiltered = re_operator_diagnostics.get_operator_diagnostics(
        env_id="env-1", quarter="2026Q2"
    )
    filtered = re_operator_diagnostics.get_operator_diagnostics(
        env_id="env-1", quarter="2026Q2", operator="Brookdale"
    )

    # All four released assets should see peer_count == 3 (cohort of 4, minus self)
    for row in unfiltered["assets"]:
        assert row["peer_set"]["peer_count"] == 3

    # Brookdale-only view narrows the returned list to 2, but each remaining
    # asset must carry the SAME peer_count (3) and the SAME peer_margin_delta
    # it had unfiltered. If either moved, peer math leaked into UI filters.
    by_id_unfiltered = {r["asset_id"]: r for r in unfiltered["assets"]}
    assert len(filtered["assets"]) == 2
    for row in filtered["assets"]:
        expected = by_id_unfiltered[row["asset_id"]]
        assert row["peer_set"]["peer_count"] == expected["peer_set"]["peer_count"] == 3
        assert row["peer_margin_delta"] == expected["peer_margin_delta"]
        assert row["peer_margin_delta"] is not None  # sanity: cohort qualifies


def test_acuity_filter_does_not_collapse_peer_set(monkeypatch):
    """Mixed-acuity cohort: filtering by acuity must not shrink peer math."""
    assets_raw = [
        _build_raw_asset(0, "Brookdale", "AL", "Dallas", 100),
        _build_raw_asset(1, "Brookdale", "AL", "Dallas", 110),
        _build_raw_asset(2, "Atria", "AL", "Dallas", 90),
        _build_raw_asset(3, "Atria", "AL", "Dallas", 85),
        _build_raw_asset(4, "Sunrise", "IL", "Dallas", 80),  # different acuity
    ]
    profiles = {
        ASSET_IDS[0]: _build_profile(ASSET_IDS[0], "Brookdale", "AL", "mid"),
        ASSET_IDS[1]: _build_profile(ASSET_IDS[1], "Brookdale", "AL", "mid"),
        ASSET_IDS[2]: _build_profile(ASSET_IDS[2], "Atria", "AL", "mid"),
        ASSET_IDS[3]: _build_profile(ASSET_IDS[3], "Atria", "AL", "mid"),
        ASSET_IDS[4]: _build_profile(ASSET_IDS[4], "Sunrise", "IL", "mid"),
    }
    quarter = "2026Q2"
    auth = {
        (ASSET_IDS[0], quarter): _released_auth(quarter, "300000", "0.92"),
        (ASSET_IDS[1], quarter): _released_auth(quarter, "330000", "0.93"),
        (ASSET_IDS[2], quarter): _released_auth(quarter, "360000", "0.95"),
        (ASSET_IDS[3], quarter): _released_auth(quarter, "380000", "0.94"),
        (ASSET_IDS[4], quarter): _released_auth(quarter, "200000", "0.88"),
    }
    operational = {
        ASSET_IDS[i]: {
            "asset_id": ASSET_IDS[i], "quarter": quarter,
            "revenue": Decimal("1000000") + Decimal(50_000 * i),
            "labor_cost": Decimal("480000") + Decimal(10_000 * i),
            "labor_cost_source": "seed", "source_type": "seed",
        }
        for i in range(5)
    }
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map={}, operational=operational,
    )

    unfiltered = re_operator_diagnostics.get_operator_diagnostics(
        env_id="env-1", quarter="2026Q2"
    )
    al_filtered = re_operator_diagnostics.get_operator_diagnostics(
        env_id="env-1", quarter="2026Q2", acuity="AL"
    )

    # The IL asset lives in its own cohort (peer_count=0, insufficient sample).
    il_row_unfiltered = [r for r in unfiltered["assets"] if r["asset_id"] == ASSET_IDS[4]][0]
    assert il_row_unfiltered["peer_set"]["peer_count"] == 0
    assert il_row_unfiltered["peer_margin_delta"] is None

    # AL filter drops the IL row from display, but AL peer math must be identical
    # to unfiltered AL peer math (cohort of 4 → peer_count=3 per asset).
    by_id = {r["asset_id"]: r for r in unfiltered["assets"]}
    for row in al_filtered["assets"]:
        assert row["peer_set"]["peer_count"] == 3
        assert row["peer_margin_delta"] == by_id[row["asset_id"]]["peer_margin_delta"]


# ─────────────────────────────────────────────────────────────
# Invariant 10 — no waterfall-dependent metrics
# ─────────────────────────────────────────────────────────────

def test_no_waterfall_metrics_in_response(monkeypatch):
    assets_raw, profiles, auth, prior_auth, operational = _default_scenario()
    _install_fixture(
        monkeypatch,
        assets_raw=assets_raw, profiles=profiles,
        auth_map=auth, prior_auth_map=prior_auth, operational=operational,
    )
    out = re_operator_diagnostics.get_operator_diagnostics(env_id="env-1", quarter="2026Q2")
    for row in out["assets"]:
        assert "carry" not in row
        assert "promote" not in row
        assert "gp_share" not in row
        for reason in row["null_reasons"].values():
            assert reason != "out_of_scope_requires_waterfall"
