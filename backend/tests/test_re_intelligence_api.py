"""Contract tests for the CRE intelligence API routes."""

from __future__ import annotations

from uuid import uuid4

import app.routes.re_intelligence as re_intelligence_routes


def test_create_ingest_run(client, monkeypatch):
    run_id = str(uuid4())

    monkeypatch.setattr(
        re_intelligence_routes.re_intelligence,
        "create_ingest_run",
        lambda **_: {
            "run_id": run_id,
            "source_key": "acs_5y",
            "scope_json": {"scope": "metro", "filters": {"metro": "33100"}},
            "status": "success",
            "rows_read": 4,
            "rows_written": 4,
            "error_count": 0,
            "duration_ms": 25,
            "token_cost": 0,
            "raw_artifact_path": "cre-intel/raw/acs_5y/test.json",
            "error_summary": None,
            "started_at": "2026-03-03T00:00:00Z",
            "finished_at": "2026-03-03T00:00:01Z",
        },
    )

    response = client.post(
        "/api/re/v2/intelligence/ingest/runs",
        json={"source_key": "acs_5y", "scope": "metro", "filters": {"metro": "33100"}},
    )

    assert response.status_code == 201
    assert response.json()["run_id"] == run_id


def test_list_geographies(client, monkeypatch):
    geography_id = str(uuid4())

    monkeypatch.setattr(
        re_intelligence_routes.re_intelligence,
        "list_geographies",
        lambda **_: {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": []},
                    "properties": {
                        "geography_id": geography_id,
                        "geography_type": "tract",
                        "geoid": "12086000100",
                        "name": "Census Tract 1, Miami-Dade",
                        "state_code": "FL",
                        "cbsa_code": "33100",
                        "vintage": 2025,
                        "metric_key": "median_income",
                        "metric_value": 68250,
                        "units": "USD",
                        "source": "acs_5y",
                        "value_vintage": "2025_5y",
                        "pulled_at": "2026-03-03T00:00:00Z",
                    },
                }
            ],
        },
    )

    response = client.get(
        "/api/re/v2/intelligence/geographies?bbox=-80.9,25.1,-79.7,26.4&layer=tract&metric_key=median_income&period=2025-12-31"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert data["features"][0]["properties"]["geoid"] == "12086000100"


def test_materialize_forecasts(client, monkeypatch):
    forecast_id = str(uuid4())
    property_id = str(uuid4())
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(
        re_intelligence_routes.re_intelligence,
        "materialize_forecasts",
        lambda **_: [
            {
                "forecast_id": forecast_id,
                "env_id": env_id,
                "business_id": business_id,
                "scope": "property",
                "entity_id": property_id,
                "target": "rent_growth_next_12m",
                "horizon": "12m",
                "model_version": "elastic_net_seed_v1",
                "prediction": 0.041,
                "lower_bound": 0.026,
                "upper_bound": 0.056,
                "baseline_prediction": 0.025,
                "status": "materialized",
                "intervals": {"p10": 0.026, "p50": 0.041, "p90": 0.056},
                "explanation_ptr": "cre-intel/explanations/1.json",
                "explanation_json": {"top_drivers": [{"feature_key": "unemployment_rate"}]},
                "source_vintages": [{"source": "acs_5y", "vintage": "2025_5y"}],
                "generated_at": "2026-03-03T00:00:00Z",
            }
        ],
    )

    response = client.post(
        "/api/re/v2/intelligence/forecasts/materialize",
        json={
            "scope": "property",
            "entity_ids": [property_id],
            "targets": ["rent_growth_next_12m"],
            "horizon": "12m",
            "feature_version": "miami_mvp_v1",
        },
    )

    assert response.status_code == 200
    assert response.json()[0]["forecast_id"] == forecast_id


def test_create_document_extraction(client, monkeypatch):
    doc_id = str(uuid4())
    env_id = str(uuid4())
    business_id = str(uuid4())
    property_id = str(uuid4())

    monkeypatch.setattr(
        re_intelligence_routes.re_intelligence,
        "create_document_extraction",
        lambda **_: {
            "doc_id": doc_id,
            "env_id": env_id,
            "business_id": business_id,
            "property_id": property_id,
            "entity_id": None,
            "type": "offering_memo",
            "uri": "documents/om.pdf",
            "extracted_json": {"document_title": "OM", "summary": {}, "evidence": {}},
            "extraction_version": "offering_memo_v1",
            "citations": [{"page": 1, "snippet": "OM", "field": "document_title"}],
            "confidence_score": 0.86,
            "review_status": "approved",
            "created_at": "2026-03-03T00:00:00Z",
            "updated_at": "2026-03-03T00:00:00Z",
        },
    )

    response = client.post(
        "/api/re/v2/intelligence/documents/extractions",
        json={
            "document_id": doc_id,
            "property_id": property_id,
            "profile_key": "offering_memo",
        },
    )

    assert response.status_code == 201
    assert response.json()["review_status"] == "approved"

