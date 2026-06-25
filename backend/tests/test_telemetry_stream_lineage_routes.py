"""Tests for the telemetry stream lineage / provenance routes (Ticket 4).

Uses the client + fake_cursor fixtures (no real DB). Each request first issues resolve_tenant_id
(consumes the first pushed result = the tenant row), then the service's own queries in order.
Covers success, filters, bounded limits, and fail-closed null_reasons.
"""
from uuid import uuid4

ENV = "telemetry-demo"
BIZ = str(uuid4())
TENANT = str(uuid4())
ROW_ID = str(uuid4())


def _tenant(fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])


def _kafka_row(**over):
    base = {
        "id": ROW_ID, "record_kind": "anomaly",
        "kafka_topic": "stargate.printer.anomalies.v1", "kafka_partition": 0, "kafka_offset": 123,
        "kafka_timestamp": None, "schema_id": 100005,
        "schema_subject": "stargate.printer.anomalies.v1-value", "schema_version": 1,
        "printer_id": "P1", "print_job_id": "J9", "run_id": None,
        "anomaly_id": "anom_1", "triage_id": None,
        "decoded_payload": {"printer_id": "P1"}, "normalized_payload": None,
        "databricks_lineage_status": "not_available",
        "databricks_null_reason": "databricks_table_mapping_not_configured",
        "ingested_at": "2026-06-25T00:00:00+00:00",
    }
    base.update(over)
    return base


def _triage(**over):
    base = {
        "triage_id": "tri_1", "anomaly_id": "anom_1", "printer_id": "P1", "print_job_id": "J9",
        "run_id": None, "severity": "high", "status": "ok", "incident_summary": "cold melt pool",
        "likely_cause": "feed interruption", "leading_indicators": ["temp_drop"],
        "recommended_action": "pause job", "confidence": "high", "requires_human_review": True,
        "null_reason": None, "kafka_row_id": ROW_ID,
        "kafka_topic": "stargate.printer.anomaly.triage.v1", "kafka_partition": 0, "kafka_offset": 77,
        "databricks_lineage_status": "not_available",
        "databricks_null_reason": "databricks_table_mapping_not_configured",
        "created_at": "2026-06-25T00:00:01+00:00",
    }
    base.update(over)
    return base


def _q(**extra):
    return {"env_id": ENV, "business_id": BIZ, **extra}


# ── /stream/kafka/rows ────────────────────────────────────────────────────────────────────────────────

def test_rows_success(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([_kafka_row(), _kafka_row(kafka_offset=124)])
    resp = client.get("/api/telemetry/stream/kafka/rows", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "ok" and d["count"] == 2
    assert d["rows"][0]["kafka_topic"] == "stargate.printer.anomalies.v1"
    assert d["rows"][0]["databricks_lineage_status"] == "not_available"


def test_rows_kind_filter_applied(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([_kafka_row(record_kind="triage")])
    resp = client.get("/api/telemetry/stream/kafka/rows", params=_q(kind="triage"))
    assert resp.status_code == 200
    # the kind filter must be in the SQL the service issued
    assert any("record_kind = %s" in q[0] for q in fake_cursor.queries)


def test_rows_invalid_kind_400(client, fake_cursor):
    _tenant(fake_cursor)
    resp = client.get("/api/telemetry/stream/kafka/rows", params=_q(kind="bogus"))
    assert resp.status_code == 400


def test_rows_limit_bounded(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([])
    # over the cap -> FastAPI le=200 rejects with 422 (bound enforced at the edge)
    resp = client.get("/api/telemetry/stream/kafka/rows", params=_q(limit=9999))
    assert resp.status_code == 422


# ── /stream/kafka/provenance/{row_id} ─────────────────────────────────────────────────────────────────

def test_provenance_success(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([dict(_kafka_row(), consumer_group="stargate-bridge-sink")])
    resp = client.get(f"/api/telemetry/stream/kafka/provenance/{ROW_ID}", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "ok"
    assert d["layers"]["kafka"]["offset"] == 123
    assert d["layers"]["databricks_lake"]["status"] == "not_available"
    assert d["layers"]["databricks_lake"]["null_reason"] == "databricks_table_mapping_not_configured"


def test_provenance_missing_fails_closed(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([])     # no row
    resp = client.get(f"/api/telemetry/stream/kafka/provenance/{ROW_ID}", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "not_available"
    assert d["null_reason"] == "kafka_provenance_unavailable"
    assert d["row"] is None


# ── /stream/kafka/triage/latest ───────────────────────────────────────────────────────────────────────

def test_triage_latest_success(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([_triage()])
    resp = client.get("/api/telemetry/stream/kafka/triage/latest", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "ok" and d["count"] == 1
    assert d["triage"][0]["severity"] == "high"


# ── /stream/kafka/triage/{anomaly_id} ─────────────────────────────────────────────────────────────────

def test_triage_by_anomaly_success(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([_triage()])
    resp = client.get("/api/telemetry/stream/kafka/triage/anom_1", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "ok" and d["triage"]["triage_id"] == "tri_1"


def test_triage_by_anomaly_not_emitted(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([])     # no triage
    resp = client.get("/api/telemetry/stream/kafka/triage/anom_404", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "not_available"
    assert d["triage"] is None
    assert d["null_reason"] == "triage_not_emitted"


# ── /stream/lineage/anomaly/{anomaly_id} ──────────────────────────────────────────────────────────────

def test_lineage_all_layers_available(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([_kafka_row()])   # detection
    fake_cursor.push_result([_triage()])      # triage
    resp = client.get("/api/telemetry/stream/lineage/anomaly/anom_1", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "ok"
    L = d["layers"]
    assert L["kafka_detection"]["status"] == "available"
    assert L["kafka_detection"]["offset"] == 123 and L["kafka_detection"]["schema_id"] == 100005
    assert L["agent_triage"]["status"] == "available"
    assert L["agent_triage"]["severity"] == "high"
    # Databricks never faked
    assert L["databricks_lake"]["status"] == "not_available"
    assert L["databricks_lake"]["table"] is None
    assert L["databricks_lake"]["null_reason"] == "databricks_table_mapping_not_configured"
    assert L["postgres_serving"]["status"] == "available"
    assert L["postgres_serving"]["row_id"] == ROW_ID


def test_lineage_missing_triage(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([_kafka_row()])   # detection present
    fake_cursor.push_result([])               # no triage
    resp = client.get("/api/telemetry/stream/lineage/anomaly/anom_1", params=_q())
    assert resp.status_code == 200
    L = resp.json()["layers"]
    assert L["kafka_detection"]["status"] == "available"
    assert L["agent_triage"]["status"] == "not_available"
    assert L["agent_triage"]["null_reason"] == "triage_not_emitted"
    assert L["postgres_serving"]["status"] == "available"


def test_lineage_unknown_anomaly_fails_closed(client, fake_cursor):
    _tenant(fake_cursor)
    fake_cursor.push_result([])   # no detection
    fake_cursor.push_result([])   # no triage
    resp = client.get("/api/telemetry/stream/lineage/anomaly/nope", params=_q())
    assert resp.status_code == 200
    d = resp.json()
    assert d["status"] == "not_available"
    assert d["null_reason"] == "kafka_provenance_unavailable"
    assert d["layers"]["kafka_detection"]["status"] == "not_available"
    assert d["layers"]["databricks_lake"]["status"] == "not_available"


def test_lineage_missing_business_404(client, fake_cursor):
    # resolve_tenant_id finds no business -> LookupError -> 404
    fake_cursor.push_result([])   # business lookup empty
    resp = client.get("/api/telemetry/stream/lineage/anomaly/anom_1", params=_q())
    assert resp.status_code == 404
