"""Relativity MES Sandbox serving-read tests (Phase 10).

Covers the happy path over mocked Lakebase serving rows, the fail-closed null_reason path (no
fabricated fallback), the suspect-lot where-used trace, the NCR/cost KPI derivations, the generic
drill-to-source allowlist, and one route-level wiring check. Uses the conftest FakeCursor — no DB.
"""
from uuid import uuid4

from app.services import relativity_mes as svc

ENV = "telemetry-demo"
BIZ = uuid4()
TENANT = uuid4()


def _resolve(fc):
    fc.push_result([{"tenant_id": TENANT}])


def test_overview_live_rows(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([
        {"vehicle_serial": "VEH-DEMO-001", "open_ncr_count": 1, "affected_by_suspect_lot": True,
         "readiness_state": "blocked", "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
    ])
    out = svc.overview(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] is None
    assert out["source_kind"] == "live-rows"
    assert out["serving_provenance"] == "seed-bootstrap"
    assert out["rows"][0]["vehicle_serial"] == "VEH-DEMO-001"


def test_overview_fail_closed_when_empty(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([])  # serving table empty -> no fabricated fallback
    out = svc.overview(env_id=ENV, business_id=BIZ)
    assert out["rows"] == []
    assert out["source_kind"] == "unavailable"
    assert out["null_reason"] == "serving_not_loaded"


def test_where_used_two_vehicles(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([
        {"vehicle_serial": "VEH-DEMO-001", "lot_no": "LOT-7788", "serving_provenance": "seed-bootstrap",
         "as_of": "2026-06-26"},
        {"vehicle_serial": "VEH-DEMO-002", "lot_no": "LOT-7788", "serving_provenance": "seed-bootstrap",
         "as_of": "2026-06-26"},
    ])
    out = svc.where_used(env_id=ENV, business_id=BIZ, lot_no="LOT-7788")
    assert out["affected_vehicle_count"] == 2
    assert out["vehicles"] == ["VEH-DEMO-001", "VEH-DEMO-002"]
    assert out["null_reason"] is None


def test_where_used_lot_not_installed(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([])
    out = svc.where_used(env_id=ENV, business_id=BIZ, lot_no="LOT-NOPE")
    assert out["affected_vehicle_count"] == 0
    assert out["null_reason"] == "lot_not_installed"


def test_ncr_kpis(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([
        {"ncr_id": "NCR-0001", "status": "open", "severity": "major", "age_days": 14,
         "defect_code": "witness-mark", "vehicle_serial": "VEH-DEMO-001",
         "estimated_rework_cost": 4200.0, "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
        {"ncr_id": "NCR-0002", "status": "closed", "severity": "major", "age_days": 6,
         "defect_code": "weld-undercut", "vehicle_serial": "VEH-DEMO-002",
         "estimated_rework_cost": 2650.0, "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
    ])
    out = svc.ncr(env_id=ENV, business_id=BIZ)
    assert out["kpis"]["open_now"] == 1
    assert out["kpis"]["major"] == 2
    assert out["kpis"]["estimated_rework_cost"] == 6850.0
    assert out["kpis"]["open_blocking"] == 1


def test_cost_kpis(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([  # rollup
        {"work_order_no": "WO-001-TPS", "material_actual_cost": 1000.0, "labor_actual_cost": 500.0,
         "ncr_rework_cost": 4200.0, "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
    ])
    fake_cursor.push_result([  # reconciliation
        {"work_order_no": "WO-001-TPS", "standard_cost": 5000.0, "actual_cost": 5700.0,
         "reconciliation_status": "exception", "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
    ])
    out = svc.cost(env_id=ENV, business_id=BIZ)
    assert out["kpis"]["standard_cost"] == 5000.0
    assert out["kpis"]["total_variance"] == 700.0
    assert out["kpis"]["unreconciled_rows"] == 1
    assert out["null_reason"] is None


def test_source_rows_allowlist_rejects_unknown_table(fake_cursor):
    out = svc.source_rows(env_id=ENV, business_id=BIZ, table="tel_predictions")
    assert out["null_reason"] == "unknown_source_table"
    assert out["source_kind"] == "unavailable"


def test_source_rows_happy(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([
        {"ncr_id": "NCR-0001", "lot_no": "LOT-7788", "synthetic": True, "as_of": "2026-06-26"},
    ])
    out = svc.source_rows(env_id=ENV, business_id=BIZ, table="rel_mes_nonconformance",
                          key="lot_no", value="LOT-7788")
    assert out["source_kind"] == "live-rows"
    assert "ncr_id" in out["columns"]
    assert out["row_count"] == 1


def test_source_rows_rejects_bad_filter_key(fake_cursor):
    out = svc.source_rows(env_id=ENV, business_id=BIZ, table="rel_mes_nonconformance",
                          key="lot_no; DROP TABLE", value="x")
    assert out["null_reason"] == "invalid_filter_key"


def test_route_overview_wired(client, fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([
        {"vehicle_serial": "VEH-DEMO-001", "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
    ])
    resp = client.get("/api/telemetry/relativity-mes/overview",
                      params={"env_id": ENV, "business_id": str(BIZ)})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_kind"] == "live-rows"
    assert body["rows"][0]["vehicle_serial"] == "VEH-DEMO-001"


# ── Build Analytics (Phase 10 hardening) ──────────────────────────────────────

def _analytics_scenario(fc):
    """Push a small realistic scenario: 3 vehicles; suspect lot on 001 & 002; one cost exception WO
    (WO-003-AVI) with NO linked NCR (a non-authored finding); VEH-DEMO-002 exposed but on_track."""
    _resolve(fc)
    fc.push_result([  # rel_build_overview
        {"vehicle_serial": "VEH-DEMO-001", "readiness_state": "blocked", "affected_by_suspect_lot": True,
         "open_ncr_count": 1, "planned_cost": 10000, "actual_cost": 16000, "variance_pct": 60,
         "variance_amount": 6000, "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
        {"vehicle_serial": "VEH-DEMO-002", "readiness_state": "on_track", "affected_by_suspect_lot": True,
         "open_ncr_count": 0, "planned_cost": 10000, "actual_cost": 10500, "variance_pct": 5,
         "variance_amount": 500, "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
        {"vehicle_serial": "VEH-DEMO-003", "readiness_state": "at_risk", "affected_by_suspect_lot": False,
         "open_ncr_count": 0, "planned_cost": 8000, "actual_cost": 11000, "variance_pct": 37.5,
         "variance_amount": 3000, "serving_provenance": "seed-bootstrap", "as_of": "2026-06-26"},
    ])
    fc.push_result([  # rel_build_cost_rollup
        {"vehicle_serial": "VEH-DEMO-001", "work_order_no": "WO-001-TPS", "material_actual_cost": 6000,
         "labor_actual_cost": 4000, "overhead_cost": 1800, "ncr_rework_cost": 4200, "total_actual_cost": 16000},
        {"vehicle_serial": "VEH-DEMO-002", "work_order_no": "WO-002-STR", "material_actual_cost": 4000,
         "labor_actual_cost": 4000, "overhead_cost": 1800, "ncr_rework_cost": 0, "total_actual_cost": 10500},
    ])
    fc.push_result([  # rel_mes_erp_reconciliation
        {"vehicle_serial": "VEH-DEMO-001", "work_order_no": "WO-001-TPS", "standard_cost": 9400,
         "actual_cost": 16000, "variance_pct": 70, "variance_amount": 6600, "variance_category": "over",
         "reconciliation_status": "exception"},
        {"vehicle_serial": "VEH-DEMO-002", "work_order_no": "WO-002-STR", "standard_cost": 10000,
         "actual_cost": 10500, "variance_pct": 5, "variance_amount": 500, "variance_category": "in_band",
         "reconciliation_status": "reconciled"},
        {"vehicle_serial": "VEH-DEMO-003", "work_order_no": "WO-003-AVI", "standard_cost": 8000,
         "actual_cost": 11000, "variance_pct": 37.5, "variance_amount": 3000, "variance_category": "over",
         "reconciliation_status": "exception"},
    ])
    fc.push_result([  # rel_ncr_traceability
        {"ncr_id": "NCR-0001", "vehicle_serial": "VEH-DEMO-001", "lot_no": "LOT-7788",
         "work_order_no": "WO-001-TPS", "work_center": "WC-NDE", "defect_code": "witness-mark",
         "severity": "major", "status": "open", "age_days": 6, "estimated_rework_cost": 4200,
         "cluster_label": "witness-mark·WC-NDE"},
        {"ncr_id": "NCR-0002", "vehicle_serial": "VEH-DEMO-002", "lot_no": None,
         "work_order_no": "WO-002-STR", "work_center": "WC-WELD", "defect_code": "weld-undercut",
         "severity": "major", "status": "closed", "age_days": 6, "estimated_rework_cost": 2650,
         "cluster_label": "weld-undercut·WC-WELD"},
    ])
    fc.push_result([  # rel_as_built_genealogy
        {"vehicle_serial": "VEH-DEMO-001", "child_type": "lot", "lot_no": "LOT-7788",
         "part_no": "PN-TPS-SEAL", "work_order_no": "WO-001-TPS"},
        {"vehicle_serial": "VEH-DEMO-002", "child_type": "lot", "lot_no": "LOT-7788",
         "part_no": "PN-TPS-SEAL", "work_order_no": "WO-002-TPS"},
    ])
    fc.push_result(  # rel_mes_operation_execution (6 on WC-NDE, 2 on WC-WELD → low_n)
        [{"work_center": "WC-NDE", "work_order_no": "WO-001-TPS", "actual_minutes": 30, "std_minutes": 25} for _ in range(6)]
        + [{"work_center": "WC-WELD", "work_order_no": "WO-002-STR", "actual_minutes": 40, "std_minutes": 30} for _ in range(2)]
    )
    fc.push_result([  # rel_mes_work_order
        {"work_order_no": "WO-001-TPS", "subassembly": "TPS"},
        {"work_order_no": "WO-002-STR", "subassembly": "STR"},
    ])


def test_analytics_blocks_and_kpis(fake_cursor):
    _analytics_scenario(fake_cursor)
    out = svc.analytics(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] is None and out["source_kind"] == "live-rows"
    k = out["kpis"]
    assert k["recon_exception_count"] == 2
    assert k["suspect_lot_vehicle_count"] == 2
    assert k["busiest_work_center"] == "WC-NDE"
    assert k["defect_concentration_pct"] == round(4200 / 6850 * 100, 2)  # emergent, computed
    b = out["blocks"]
    # bridge residual is analytics-only: 001 reconciles to 0, 002 leaves 700 unexplained
    by_v = {r["vehicle_serial"]: r for r in b["bridge"]["rows"]}
    assert by_v["VEH-DEMO-001"]["residual"] == 0.0
    assert by_v["VEH-DEMO-002"]["residual"] == 700.0
    # pareto sorted + concentration computed (no Lorenz)
    assert b["pareto"]["rows"][0]["rework_cost"] == 4200.0
    assert b["pareto"]["concentration_pct"] == round(4200 / 6850 * 100, 2)
    # workcenter low-n flag on the 2-op cell
    assert any(r["low_n"] for r in b["workcenter"]["rows"])
    # recon threshold sensitivity present
    assert any(s["k"] == 25 for s in b["recon"]["threshold_sensitivity"])


def test_analytics_asymmetry_explains_001_vs_002(fake_cursor):
    _analytics_scenario(fake_cursor)
    out = svc.analytics(env_id=ENV, business_id=BIZ)
    asym = out["blocks"]["asymmetry"]
    assert asym["shared_exposure"] == ["VEH-DEMO-001", "VEH-DEMO-002"]
    by_v = {r["vehicle_serial"]: r for r in asym["rows"]}
    assert by_v["VEH-DEMO-001"]["open_major_ncr"] == 1
    assert by_v["VEH-DEMO-002"]["open_major_ncr"] == 0


def test_analytics_surfaces_non_authored_findings(fake_cursor):
    # The hard "not replaying seeds" criterion: at least one finding NOT in the planted story.
    _analytics_scenario(fake_cursor)
    out = svc.analytics(env_id=ENV, business_id=BIZ)
    kinds = {f["kind"] for f in out["blocks"]["disconfirmation"]["findings"]}
    assert "exception_without_ncr" in kinds          # WO-003-AVI: 37.5% exception, no linked NCR
    assert "exposed_not_blocked" in kinds            # VEH-DEMO-002: has the lot but on_track


def test_analytics_page_fail_closed_when_core_mart_empty(fake_cursor):
    _resolve(fake_cursor)
    fake_cursor.push_result([])  # rel_build_overview empty -> page-level fail closed
    out = svc.analytics(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] == "serving_not_loaded"
    assert out["kpis"] is None and out["blocks"] == {}


def test_recon_exception_threshold_boundary():
    # RECON_EXCEPTION_PCT is the single source of truth; assert the >= boundary so it can't drift.
    assert svc.RECON_EXCEPTION_PCT == 25.0
    block = svc._recon_block([
        {"work_order_no": "A", "variance_pct": 25.0},   # exactly at threshold -> exception
        {"work_order_no": "B", "variance_pct": 24.99},  # just under -> not
    ])
    by_wo = {r["work_order_id"]: r for r in block["rows"]}
    assert by_wo["A"]["is_exception"] is True
    assert by_wo["B"]["is_exception"] is False
