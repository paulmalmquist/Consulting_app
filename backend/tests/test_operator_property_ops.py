from __future__ import annotations

from uuid import UUID

import app.routes.operator as operator_routes
from app.services import operator_property_ops as svc
from app.services.env_context import EnvBusinessContext


ENV_ID = "11111111-1111-4111-8111-111111111111"
BUSINESS_ID = "22222222-2222-4222-8222-222222222222"


def _ctx() -> EnvBusinessContext:
    return EnvBusinessContext(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
        created=False,
        source="test",
        diagnostics={"binding_found": True},
        environment={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "industry": "multi_entity_operator",
            "industry_type": "multi_entity_operator",
        },
    )


def _resolver(_request, _env_id, _business_id=None):
    return UUID(ENV_ID), UUID(BUSINESS_ID), _ctx()


def test_fixture_loads_deterministically_with_required_counts():
    first = svc.get_dataset()
    second = svc.get_dataset()

    assert first == second
    assert first["metadata"]["demo_mode"] is True
    assert first["metadata"]["data_source"] == "synthetic_demo"
    assert "Not HappyCo production data" in first["metadata"]["caveat"]

    assert len(first["operators"]) == 3
    assert len(first["properties"]) == 5
    assert len(first["buildings"]) == 10
    assert len(first["units"]) == 80
    assert len(first["inspections"]) == 40
    assert len(first["findings"]) == 120
    assert len(first["work_orders"]) == 150
    assert len(first["vendors"]) == 8
    assert len(first["resolution_events"]) == 100
    assert len(first["resident_impact_events"]) == 30
    assert len(first["source_records"]) >= 20


def test_entity_resolution_records_cover_required_match_reasons():
    dataset = svc.get_dataset()
    reasons = {row["match_reason"] for row in dataset["entity_resolution"]}

    assert svc.REQUIRED_MATCH_REASONS.issubset(reasons)
    assert any(row["requires_human_review"] for row in dataset["entity_resolution"])
    review_row = next(row for row in dataset["entity_resolution"] if row["requires_human_review"])
    assert review_row["match_reason"] == "manual_review_required"
    assert review_row["match_confidence"] < 0.9


def test_parkline_commons_is_high_risk_and_underperforming():
    dataset = svc.get_dataset()
    parkline = next(row for row in dataset["benchmarks"] if row["property_id"] == "prop-parkline-commons")

    assert parkline["risk_flag"] == "high"
    assert parkline["repeat_work_order_count"] >= 12
    assert parkline["repeat_rate_peer_ratio"] is not None
    assert parkline["repeat_rate_peer_ratio"] >= 1.5
    assert parkline["resident_impact_proxy_count"] == 12


def test_benchmark_metrics_do_not_fake_zero_missing_denominators():
    assert svc._safe_div(5, 0) is None
    assert svc._safe_div(None, 10) is None

    dataset = svc.get_dataset()
    for row in dataset["benchmarks"]:
        assert row["work_order_count"] > 0
        assert row["repeat_work_order_rate"] is not None
        if row["peer_repeat_work_order_rate_median"] is None:
            assert row["repeat_rate_peer_ratio"] is None


def test_recommendations_reference_real_evidence_ids():
    dataset = svc.get_dataset()
    evidence_ids = {row["evidence_id"] for row in dataset["evidence"]}
    source_ids = set()
    for collection in (
        dataset["work_orders"],
        dataset["findings"],
        dataset["vendors"],
        dataset["benchmarks"],
    ):
        for row in collection:
            for key in ("work_order_id", "finding_id", "vendor_id", "property_id"):
                if key in row:
                    source_ids.add(row[key])

    parkline_rec = next(
        row for row in dataset["recommendations"] if row["property_id"] == "prop-parkline-commons"
    )
    assert parkline_rec["human_review_required"] is True
    assert parkline_rec["ml_status"] == "not_available"
    assert set(parkline_rec["evidence_ids"]).issubset(evidence_ids)
    for evidence in parkline_rec["evidence"]:
        assert evidence["source_ids"]
        # Benchmark evidence uses a synthetic benchmark id, all others are concrete source ids.
        assert evidence["source_type"] == "benchmark" or set(evidence["source_ids"]).issubset(source_ids)


def test_ml_feature_rows_have_ticket_3a_contract_fields():
    rows = svc.ml_feature_rows()
    assert len(rows) == 30

    required = {
        "feature_row_id",
        "property_id",
        "building_id",
        "category",
        "trailing_30_day_work_order_count",
        "trailing_60_day_work_order_count",
        "repeat_work_order_rate",
        "reopened_work_order_rate",
        "average_aging_days",
        "inspection_severity_score",
        "hvac_finding_count",
        "plumbing_finding_count",
        "moisture_finding_count",
        "safety_finding_count",
        "vendor_first_time_fix_rate",
        "vendor_average_aging",
        "resident_impact_proxy_count",
        "property_unit_count",
        "peer_group",
        "prior_escalation_flag",
        "maintenance_escalation_risk_30d",
    }
    assert required.issubset(rows[0])
    assert any(row["maintenance_escalation_risk_30d"] == 1 for row in rows)
    assert any(row["property_id"] == "prop-parkline-commons" and row["category"] == "hvac" for row in rows)


def test_graph_exposes_nodes_and_edges_for_property_ops_chain():
    payload = svc.graph()

    node_types = {row["type"] for row in payload["nodes"]}
    relationships = {row["relationship"] for row in payload["edges"]}

    assert {"operator", "property", "building", "unit", "inspection", "finding", "work_order", "vendor"}.issubset(node_types)
    assert {"manages", "contains", "inspected_by", "generates", "creates", "assigned_to", "resolves", "impacts"}.issubset(relationships)


def test_operator_property_ops_api_endpoints_return_demo_payloads(client, monkeypatch, tmp_path):
    monkeypatch.setattr(operator_routes, "_resolve_context", _resolver)
    monkeypatch.setattr(svc, "ARTIFACT_ROOT", tmp_path / "missing-ml")
    monkeypatch.setattr(svc, "DATABRICKS_ARTIFACT_ROOT", tmp_path / "missing-databricks")

    entities = client.get("/api/operator/v1/property-ops/entities", params={"env_id": ENV_ID})
    assert entities.status_code == 200
    assert entities.json()["demo_mode"] is True
    assert len(entities.json()["properties"]) == 5

    graph = client.get("/api/operator/v1/property-ops/graph", params={"env_id": ENV_ID})
    assert graph.status_code == 200
    assert graph.json()["data_source"] == "synthetic_demo"
    assert graph.json()["nodes"]
    assert graph.json()["edges"]

    benchmarks = client.get("/api/operator/v1/property-ops/benchmarks", params={"env_id": ENV_ID})
    assert benchmarks.status_code == 200
    parkline = next(row for row in benchmarks.json()["benchmarks"] if row["property_id"] == "prop-parkline-commons")
    assert parkline["risk_flag"] == "high"

    recommendations = client.get("/api/operator/v1/property-ops/recommendations", params={"env_id": ENV_ID})
    assert recommendations.status_code == 200
    body = recommendations.json()
    assert body["ml_status"] == "not_available"
    assert body["recommendations"][0]["evidence"]

    ml_risk = client.get(
        "/api/operator/v1/property-ops/ml-risk",
        params={"env_id": ENV_ID, "property_id": "prop-parkline-commons"},
    )
    assert ml_risk.status_code == 200
    assert ml_risk.json()["ml_status"] == "not_available"
    assert ml_risk.json()["databricks_status"] == "not_run"
    assert ml_risk.json()["predictions"] == []


def test_ml_risk_reports_databricks_attempt_receipt(monkeypatch, tmp_path):
    receipt_dir = tmp_path / "databricks"
    receipt_dir.mkdir()
    (receipt_dir / "databricks_run_attempt_receipt.json").write_text(
        """
{
  "demo_mode": true,
  "data_source": "synthetic_demo",
  "databricks_executed": false,
  "databricks_status": "not_configured",
  "status": "failed",
  "error_category": "cli_not_found",
  "next_setup_step": "Install Databricks CLI and run databricks auth profiles.",
  "caveat": "Synthetic demo data. Not HappyCo production data."
}
""".strip()
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(svc, "DATABRICKS_ARTIFACT_ROOT", receipt_dir)
    payload = svc.ml_risk_predictions()

    assert payload["databricks_status"] == "not_configured"
    assert payload["databricks_receipt"]["error_category"] == "cli_not_found"
