from uuid import uuid4


def test_metrics_query_route(client, monkeypatch):
    business_id = str(uuid4())

    def _mock_query_metrics(**kwargs):
        assert str(kwargs["business_id"]) == business_id
        return {
            "query_hash": "abc123",
            "points": [
                {
                    "metric_id": str(uuid4()),
                    "metric_key": "repe_distribution_total",
                    "metric_label": "REPE Distribution Total",
                    "unit": "USD",
                    "aggregation": "sum",
                    "dimension": "scope",
                    "dimension_value": "business",
                    "value": "12000000",
                    "source_fact_ids": [str(uuid4())],
                }
            ],
        }

    monkeypatch.setattr("app.services.metrics_semantic.query_metrics", _mock_query_metrics)

    resp = client.post(
        "/api/metrics/query",
        json={
            "business_id": business_id,
            "metric_keys": ["repe_distribution_total"],
            "dimension": "scope",
            "refresh": True,
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["query_hash"] == "abc123"
    assert len(payload["points"]) == 1


def test_reports_create_run_explain(client, monkeypatch):
    business_id = str(uuid4())
    report_id = str(uuid4())
    report_run_id = str(uuid4())

    monkeypatch.setattr(
        "app.services.reports.create_report",
        lambda **kwargs: {
            "report_id": report_id,
            "key": "pipeline_repe_snapshot",
            "label": kwargs["title"],
            "description": kwargs.get("description"),
            "version": 1,
            "config": kwargs["query"],
            "created_at": "2026-02-18T00:00:00Z",
        },
    )
    monkeypatch.setattr(
        "app.services.reports.run_report",
        lambda **kwargs: {
            "report_run_id": report_run_id,
            "run_id": str(uuid4()),
            "query_hash": "hash-1",
            "points": [],
        },
    )
    monkeypatch.setattr(
        "app.services.reports.explain_report_run",
        lambda **kwargs: {
            "report_id": report_id,
            "report_run_id": report_run_id,
            "explanation": [],
        },
    )

    create_resp = client.post(
        "/api/reports",
        json={
            "business_id": business_id,
            "title": "Pipeline + REPE Snapshot",
            "query": {"metric_keys": ["crm_open_pipeline_amount"]},
            "is_draft": False,
        },
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["report_id"] == report_id

    run_resp = client.post(
        f"/api/reports/{report_id}/run",
        json={"business_id": business_id, "refresh": True},
    )
    assert run_resp.status_code == 200
    assert run_resp.json()["report_run_id"] == report_run_id

    explain_resp = client.get(
        f"/api/reports/{report_id}/runs/{report_run_id}/explain?business_id={business_id}"
    )
    assert explain_resp.status_code == 200
    assert explain_resp.json()["report_id"] == report_id
