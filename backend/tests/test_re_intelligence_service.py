"""Service-level tests for CRE intelligence workflows."""

from __future__ import annotations

from uuid import uuid4


def test_refresh_question_signals_records_market_run_and_returns_bundle(fake_cursor, monkeypatch):
    from app.services import re_intelligence

    question_id = uuid4()
    env_id = uuid4()
    business_id = uuid4()
    initial_question = {
        "question_id": str(question_id),
        "env_id": str(env_id),
        "business_id": str(business_id),
        "text": "Will Miami metro unemployment exceed 5.0% by 2026-12-31?",
        "scope": "macro",
        "entity_id": None,
        "event_date": "2026-12-31",
        "resolution_criteria": "BLS metro unemployment",
        "resolution_source": "BLS",
        "probability": 0.5,
        "method": "ensemble",
        "status": "open",
        "brier_score": None,
        "last_moved_at": "2026-03-03T00:00:00Z",
        "created_at": "2026-03-03T00:00:00Z",
    }
    updated_question = {**initial_question, "probability": 0.431}

    fake_cursor.push_result([initial_question])   # _get_question
    fake_cursor.push_result([])                   # _latest_probability("analyst")
    fake_cursor.push_result([updated_question])   # update forecast_questions returning *
    fake_cursor.push_result([updated_question])   # _get_question in get_question_signals
    fake_cursor.push_result([                    # signal query in get_question_signals
        {
            "signal_source": "aggregate",
            "signal_type": "ensemble",
            "probability": 0.431,
            "weight": 1.0,
            "observed_at": "2026-03-03T00:00:00Z",
            "source_ref": "ensemble_seed_v1",
            "metadata_json": {"reason_codes": ["brier_weighted_ensemble", "kalshi_refresh"]},
        },
        {
            "signal_source": "kalshi_markets",
            "signal_type": "market",
            "probability": 0.47,
            "weight": 0.35,
            "observed_at": "2026-03-03T00:00:00Z",
            "source_ref": "cre-intel/raw/kalshi_markets/run-1.json",
            "metadata_json": {"provider": "Kalshi", "read_only": True},
        },
        {
            "signal_source": "internal_model",
            "signal_type": "model",
            "probability": 0.41,
            "weight": 0.65,
            "observed_at": "2026-03-03T00:00:00Z",
            "source_ref": "forecast_registry",
            "metadata_json": {"model_version": "ensemble_seed_v1"},
        },
    ])

    ingest_calls: list[dict] = []

    def fake_create_ingest_run(**kwargs):
        ingest_calls.append(kwargs)
        return {
            "run_id": str(uuid4()),
            "source_key": "kalshi_markets",
            "raw_artifact_path": "cre-intel/raw/kalshi_markets/run-1.json",
        }

    monkeypatch.setattr(re_intelligence, "create_ingest_run", fake_create_ingest_run)
    monkeypatch.setattr(re_intelligence, "_internal_probability_for_question", lambda _: 0.41)
    monkeypatch.setattr(re_intelligence, "_kalshi_probability", lambda _: 0.47)

    bundle = re_intelligence.refresh_question_signals(question_id=question_id)

    assert ingest_calls == [{
        "source_key": "kalshi_markets",
        "scope": "national",
        "filters": {
            "question_text": "Will Miami metro unemployment exceed 5.0% by 2026-12-31?",
            "event_date": "2026-12-31",
        },
        "force_refresh": True,
    }]
    assert bundle["question"]["question_id"] == str(question_id)
    assert bundle["aggregate_probability"] == 0.431
    sql = "\n".join(query for query, _ in fake_cursor.queries)
    assert sql.count("INSERT INTO forecast_signal_observation") == 3
    assert "UPDATE forecast_questions" in sql


def test_create_document_extraction_flags_low_confidence_for_review(fake_cursor, monkeypatch):
    from app.services import re_intelligence

    document_id = uuid4()
    property_id = uuid4()
    env_id = uuid4()
    business_id = uuid4()

    fake_cursor.push_result([{
        "document_id": str(document_id),
        "business_id": str(business_id),
        "title": "Loan Agreement - Miami Tower",
        "virtual_path": None,
        "object_key": "tenant/test/business/test/document/test.pdf",
    }])
    fake_cursor.push_result([{"env_id": str(env_id)}])
    fake_cursor.push_result([{
        "doc_id": str(document_id),
        "env_id": str(env_id),
        "business_id": str(business_id),
        "property_id": str(property_id),
        "entity_id": None,
        "type": "loan_agreement",
        "uri": "storage/path",
        "extracted_json": {"document_title": "Loan Agreement - Miami Tower", "summary": {}, "evidence": {}},
        "extraction_version": "loan_agreement_v1",
        "citations": [{"page": 1, "snippet": "Loan Agreement", "field": "principal_balance"}],
        "confidence_score": 0.78,
        "review_status": "review_required",
        "created_at": "2026-03-03T00:00:00Z",
        "updated_at": "2026-03-03T00:00:00Z",
    }])

    work_calls: list[dict] = []
    monkeypatch.setattr(
        re_intelligence.work,
        "create_item",
        lambda **kwargs: work_calls.append(kwargs) or {"work_item_id": str(uuid4()), "status": "open"},
    )

    row = re_intelligence.create_document_extraction(
        document_id=document_id,
        profile_key="loan_agreement",
        property_id=property_id,
    )

    assert row["review_status"] == "review_required"
    assert len(work_calls) == 1
    assert work_calls[0]["business_id"] == business_id
    assert work_calls[0]["owner"] == "hitl_queue"
