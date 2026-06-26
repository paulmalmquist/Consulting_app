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
