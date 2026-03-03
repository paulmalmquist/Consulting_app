from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from jsonschema import validate

from app.connectors.cre import get_connector
from app.connectors.cre.base import ConnectorContext
from app.db import get_cursor
from app.services import compliance, work
from app.services.documents import STORAGE_BUCKET
from app.services.extraction_profiles import get_profile_schema

DEFAULT_FEATURE_VERSION = "miami_mvp_v1"
FORECAST_TARGETS = {
    "rent_growth_next_12m",
    "vacancy_change_next_12m",
    "value_change_proxy_next_12m",
    "refi_risk_score",
    "distress_probability",
}
_METRIC_LABELS = {
    "median_income": ("Median Household Income", "macro"),
    "population": ("Population", "macro"),
    "rent_burden_proxy": ("Rent Burden Proxy", "housing"),
    "median_rent": ("Median Gross Rent", "housing"),
    "unemployment_rate": ("Unemployment Rate", "macro"),
    "employment_level": ("Employment Level", "macro"),
    "fair_market_rent": ("Fair Market Rent", "housing"),
    "storm_event_count": ("Storm Event Count", "hazard"),
    "severe_event_index": ("Severe Event Index", "hazard"),
}
_CRE_DOC_PROFILES = {
    "offering_memo": {"summary_fields": ["asset_name", "ask_price", "headline_noi"], "confidence": 0.86},
    "rent_roll": {"summary_fields": ["occupancy_rate", "weighted_avg_rent", "tenant_count"], "confidence": 0.83},
    "t12": {"summary_fields": ["noi_t12", "opex_t12", "revenue_t12"], "confidence": 0.84},
    "appraisal": {"summary_fields": ["appraised_value", "cap_rate", "valuation_date"], "confidence": 0.88},
    "loan_agreement": {"summary_fields": ["principal_balance", "interest_rate", "maturity_date"], "confidence": 0.78},
    "lease_abstract": {"summary_fields": ["tenant_name", "lease_start", "lease_end"], "confidence": 0.81},
}


def create_ingest_run(
    *,
    source_key: str,
    scope: str,
    filters: dict,
    force_refresh: bool = False,
) -> dict:
    connector = get_connector(source_key)
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cre_ingest_run (source_key, scope_json, status)
            VALUES (%s, %s::jsonb, 'running')
            RETURNING *
            """,
            (source_key, json.dumps({"scope": scope, "filters": filters})),
        )
        run = cur.fetchone()
    context = ConnectorContext(
        run_id=str(run["run_id"]),
        source_key=source_key,
        scope=scope,
        filters=filters,
        force_refresh=force_refresh,
    )
    started = datetime.now(timezone.utc)
    try:
        result = connector.run(context)
        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000)
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE cre_ingest_run
                SET status = 'success',
                    rows_read = %s,
                    rows_written = %s,
                    duration_ms = %s,
                    token_cost = %s,
                    raw_artifact_path = %s,
                    finished_at = now()
                WHERE run_id = %s
                RETURNING *
                """,
                (
                    result.rows_read,
                    result.rows_written,
                    duration_ms,
                    result.token_cost,
                    result.raw_artifact_path,
                    str(run["run_id"]),
                ),
            )
            return cur.fetchone()
    except Exception as exc:
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE cre_ingest_run
                SET status = 'failed',
                    error_count = error_count + 1,
                    error_summary = %s,
                    finished_at = now()
                WHERE run_id = %s
                RETURNING *
                """,
                (str(exc), str(run["run_id"])),
            )
            cur.fetchone()
        raise


def list_ingest_runs(*, source_key: str | None = None, status: str | None = None, limit: int = 25) -> list[dict]:
    conditions: list[str] = []
    params: list = []
    if source_key:
        conditions.append("source_key = %s")
        params.append(source_key)
    if status:
        conditions.append("status = %s")
        params.append(status)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(
            f"SELECT * FROM cre_ingest_run {where} ORDER BY started_at DESC LIMIT %s",
            params,
        )
        return cur.fetchall()


def list_geographies(
    *,
    bbox: tuple[float, float, float, float] | None,
    layer: str | None,
    metric_key: str | None,
    period: date | None,
) -> dict:
    conditions = ["dg.geom IS NOT NULL"]
    params: list = []
    if layer:
        conditions.append("dg.geography_type = %s")
        params.append(layer)
    if bbox:
        min_lon, min_lat, max_lon, max_lat = bbox
        conditions.append(
            "ST_Intersects(dg.geom, ST_MakeEnvelope(%s, %s, %s, %s, 4326))"
        )
        params.extend([min_lon, min_lat, max_lon, max_lat])
    metric_sql = ""
    if metric_key:
        metric_sql = """
        LEFT JOIN LATERAL (
          SELECT metric_key, value, units, source, vintage, pulled_at
          FROM fact_market_timeseries fmt
          WHERE fmt.geography_id = dg.geography_id
            AND fmt.metric_key = %s
            AND (%s::date IS NULL OR fmt.period = %s::date)
          ORDER BY fmt.period DESC, fmt.pulled_at DESC
          LIMIT 1
        ) fm ON true
        """
        params = [metric_key, period, period, *params]
    else:
        metric_sql = """
        LEFT JOIN LATERAL (
          SELECT NULL::text AS metric_key, NULL::numeric AS value, NULL::text AS units,
                 NULL::text AS source, NULL::text AS vintage, NULL::timestamptz AS pulled_at
        ) fm ON true
        """
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT dg.geography_id, dg.geography_type, dg.geoid, dg.name, dg.state_code, dg.cbsa_code,
                   dg.vintage, ST_AsGeoJSON(dg.geom)::jsonb AS geometry,
                   fm.metric_key, fm.value, fm.units, fm.source, fm.vintage AS value_vintage, fm.pulled_at
            FROM dim_geography dg
            {metric_sql}
            WHERE {' AND '.join(conditions)}
            ORDER BY dg.geography_type, dg.geoid
            LIMIT 250
            """,
            params,
        )
        rows = cur.fetchall()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": row["geometry"],
                "properties": {
                    "geography_id": row["geography_id"],
                    "geography_type": row["geography_type"],
                    "geoid": row["geoid"],
                    "name": row["name"],
                    "state_code": row["state_code"],
                    "cbsa_code": row["cbsa_code"],
                    "vintage": row["vintage"],
                    "metric_key": row.get("metric_key"),
                    "metric_value": float(row["value"]) if row.get("value") is not None else None,
                    "units": row.get("units"),
                    "source": row.get("source"),
                    "value_vintage": row.get("value_vintage"),
                    "pulled_at": row.get("pulled_at"),
                },
            }
            for row in rows
        ],
    }


def list_properties(
    *,
    env_id: UUID,
    bbox: tuple[float, float, float, float] | None = None,
    property_type: str | None = None,
    search: str | None = None,
    risk_band: str | None = None,
) -> list[dict]:
    conditions = ["p.env_id = %s"]
    params: list = [str(env_id)]
    if bbox:
        min_lon, min_lat, max_lon, max_lat = bbox
        conditions.append("p.lon BETWEEN %s AND %s")
        conditions.append("p.lat BETWEEN %s AND %s")
        params.extend([min_lon, max_lon, min_lat, max_lat])
    if property_type:
        conditions.append("p.land_use = %s")
        params.append(property_type)
    if search:
        conditions.append("(p.property_name ILIKE %s OR COALESCE(p.address, '') ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])
    rows = _query_property_rows(conditions=conditions, params=params)
    if not rows:
        _bootstrap_properties_from_pipeline(env_id=env_id)
        rows = _query_property_rows(conditions=conditions, params=params)
    out: list[dict] = []
    for row in rows:
        prediction = row.get("latest_prediction")
        if risk_band and prediction is not None:
            score = float(prediction)
            current_band = "low" if score < 0.2 else ("high" if score >= 0.5 else "medium")
            if current_band != risk_band:
                continue
        out.append(_serialize_property_summary(row))
    return out


def get_property_detail(*, property_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.property_id, p.env_id, p.business_id, p.property_name, p.address, p.city, p.state,
                   p.postal_code, p.lat, p.lon, p.land_use, p.size_sqft, p.year_built,
                   p.resolution_confidence, p.source_provenance
            FROM dim_property p
            WHERE p.property_id = %s
            """,
            (str(property_id),),
        )
        property_row = cur.fetchone()
        if not property_row:
            raise LookupError(f"Property {property_id} not found")
        cur.execute(
            """
            SELECT bpg.geography_id, dg.geography_type, dg.geoid, dg.name, dg.state_code,
                   dg.cbsa_code, bpg.confidence, bpg.match_method
            FROM bridge_property_geography bpg
            JOIN dim_geography dg ON dg.geography_id = bpg.geography_id
            WHERE bpg.property_id = %s
            ORDER BY dg.geography_type, dg.geoid
            """,
            (str(property_id),),
        )
        geo_rows = cur.fetchall()
        cur.execute(
            """
            SELECT bpe.entity_id, de.entity_type, de.name, bpe.role, bpe.confidence, de.identifiers
            FROM bridge_property_entity bpe
            JOIN dim_entity de ON de.entity_id = bpe.entity_id
            WHERE bpe.property_id = %s
            ORDER BY de.entity_type, de.name
            """,
            (str(property_id),),
        )
        entity_rows = cur.fetchall()
        cur.execute(
            """
            SELECT parcel_id, county_fips, assessor_id, land_area, assessed_value, tax_year, provenance
            FROM dim_parcel
            WHERE parcel_id = ANY(
              SELECT unnest(parcel_ids) FROM dim_property WHERE property_id = %s
            )
            """,
            (str(property_id),),
        )
        parcel_rows = cur.fetchall()
        cur.execute(
            """
            SELECT building_id, floors, construction_type, sqft, year_built, provenance, created_at
            FROM dim_building
            WHERE property_id = %s
            ORDER BY created_at ASC
            """,
            (str(property_id),),
        )
        building_rows = cur.fetchall()
        cur.execute(
            """
            SELECT *
            FROM forecast_registry
            WHERE scope = 'property'
              AND entity_id = %s
            ORDER BY generated_at DESC
            LIMIT 10
            """,
            (str(property_id),),
        )
        forecasts = cur.fetchall()
    property_summary = _serialize_property_summary(property_row)
    return {
        "property": property_summary,
        "source_provenance": property_row.get("source_provenance") or {},
        "parcels": parcel_rows,
        "buildings": building_rows,
        "linked_geographies": geo_rows,
        "linked_entities": entity_rows,
        "latest_forecasts": [_serialize_forecast(row) for row in forecasts],
    }


def get_property_externalities(*, property_id: UUID, period: date | None = None) -> dict:
    period = period or date(2025, 12, 31)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT fmt.metric_key, fmt.value, fmt.units, fmt.source, fmt.vintage, fmt.pulled_at, fmt.provenance
            FROM bridge_property_geography bpg
            JOIN fact_market_timeseries fmt ON fmt.geography_id = bpg.geography_id
            WHERE bpg.property_id = %s
              AND fmt.period = %s
            ORDER BY fmt.metric_key
            """,
            (str(property_id), period),
        )
        rows = cur.fetchall()
    buckets = {"macro": [], "housing": [], "hazard": [], "policy": []}
    for row in rows:
        label, bucket = _METRIC_LABELS.get(row["metric_key"], (row["metric_key"], "policy"))
        buckets[bucket].append(
            {
                "metric_key": row["metric_key"],
                "label": label,
                "value": float(row["value"]),
                "units": row.get("units"),
                "source": row["source"],
                "vintage": row.get("vintage"),
                "pulled_at": row.get("pulled_at"),
                "provenance": row.get("provenance") or {},
            }
        )
    return {
        "property_id": property_id,
        "period": period,
        **buckets,
    }


def get_property_features(*, property_id: UUID, period: date | None = None, version: str | None = None) -> list[dict]:
    period = period or date(2025, 12, 31)
    version = version or DEFAULT_FEATURE_VERSION
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM feature_store
            WHERE entity_scope = 'property'
              AND entity_id = %s
              AND period = %s
              AND version = %s
            ORDER BY feature_key
            """,
            (str(property_id), period, version),
        )
        rows = cur.fetchall()
    if rows:
        return rows
    _materialize_property_features(property_id=property_id, period=period, version=version)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM feature_store
            WHERE entity_scope = 'property'
              AND entity_id = %s
              AND period = %s
              AND version = %s
            ORDER BY feature_key
            """,
            (str(property_id), period, version),
        )
        return cur.fetchall()


def materialize_forecasts(
    *,
    scope: str,
    entity_ids: list[UUID],
    targets: list[str],
    horizon: str,
    feature_version: str,
) -> list[dict]:
    if scope != "property":
        raise ValueError("Only property-scoped forecasts are supported in the MVP")
    out: list[dict] = []
    for entity_id in entity_ids:
        features = get_property_features(property_id=entity_id, version=feature_version)
        feature_map = {row["feature_key"]: float(row["value"]) for row in features}
        with get_cursor() as cur:
            cur.execute(
                "SELECT env_id, business_id FROM dim_property WHERE property_id = %s",
                (str(entity_id),),
            )
            scope_row = cur.fetchone()
        if not scope_row:
            raise LookupError(f"Property {entity_id} not found")
        for target in targets:
            if target not in FORECAST_TARGETS:
                raise ValueError(f"Unsupported forecast target: {target}")
            prediction, low, high, baseline, model_version, explanation = _score_target(target, feature_map, feature_version)
            forecast_id = uuid4()
            explanation_ptr = f"cre-intel/explanations/{forecast_id}.json"
            with get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO forecast_registry (
                      forecast_id, env_id, business_id, scope, entity_id, target, horizon,
                      model_version, prediction, lower_bound, upper_bound, baseline_prediction,
                      status, intervals, explanation_ptr, explanation_json, source_vintages
                    )
                    VALUES (
                      %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s,
                      'materialized', %s::jsonb, %s, %s::jsonb, %s::jsonb
                    )
                    RETURNING *
                    """,
                    (
                        str(forecast_id),
                        str(scope_row["env_id"]),
                        str(scope_row["business_id"]),
                        scope,
                        str(entity_id),
                        target,
                        horizon,
                        model_version,
                        prediction,
                        low,
                        high,
                        baseline,
                        json.dumps({"p10": low, "p50": prediction, "p90": high}),
                        explanation_ptr,
                        json.dumps(explanation),
                        json.dumps(_source_vintage_list(feature_map)),
                    ),
                )
                out.append(cur.fetchone())
    return out


def get_forecast(*, forecast_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM forecast_registry WHERE forecast_id = %s", (str(forecast_id),))
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Forecast {forecast_id} not found")
    return _serialize_forecast(row)


def list_questions(
    *,
    env_id: UUID | None = None,
    business_id: UUID | None = None,
    scope: str | None = None,
    status: str | None = None,
) -> list[dict]:
    conditions: list[str] = []
    params: list = []
    if env_id:
        conditions.append("env_id = %s")
        params.append(str(env_id))
    if business_id:
        conditions.append("business_id = %s")
        params.append(str(business_id))
    if scope:
        conditions.append("scope = %s")
        params.append(scope)
    if status:
        conditions.append("status = %s")
        params.append(status)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with get_cursor() as cur:
        cur.execute(
            f"SELECT * FROM forecast_questions {where} ORDER BY event_date ASC, created_at DESC LIMIT 100",
            params,
        )
        return cur.fetchall()


def create_question(
    *,
    env_id: UUID,
    business_id: UUID,
    text: str,
    scope: str,
    event_date: date,
    resolution_criteria: str,
    resolution_source: str,
    entity_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO forecast_questions (
              env_id, business_id, text, scope, entity_id, event_date,
              resolution_criteria, resolution_source, probability, method, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0.5, 'ensemble', 'open')
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                text,
                scope,
                str(entity_id) if entity_id else None,
                event_date,
                resolution_criteria,
                resolution_source,
            ),
        )
        return cur.fetchone()


def get_question_signals(*, question_id: UUID) -> dict:
    question = _get_question(question_id)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT signal_source, signal_type, probability, weight, observed_at, source_ref, metadata_json
            FROM forecast_signal_observation
            WHERE question_id = %s
            ORDER BY observed_at DESC
            """,
            (str(question_id),),
        )
        rows = cur.fetchall()
    latest_by_source: dict[str, dict] = {}
    for row in rows:
        latest_by_source.setdefault(row["signal_source"], row)
    aggregate = float(question["probability"])
    weights = {
        key: float(value["weight"]) if value.get("weight") is not None else 0.0
        for key, value in latest_by_source.items()
    }
    reason_codes = ["probability_from_registry"]
    return {
        "question": question,
        "signals": list(latest_by_source.values()),
        "aggregate_probability": aggregate,
        "weights": weights,
        "reason_codes": reason_codes,
    }


def refresh_question_signals(*, question_id: UUID) -> dict:
    question = _get_question(question_id)
    internal_probability = _internal_probability_for_question(question)
    kalshi_run = create_ingest_run(
        source_key="kalshi_markets",
        scope="national",
        filters={"question_text": question["text"], "event_date": str(question["event_date"])},
        force_refresh=True,
    )
    kalshi_probability = _kalshi_probability(question["text"])
    analyst_probability = _latest_probability(question_id, "analyst")
    weights = _weight_map(analyst_probability is not None)
    aggregate = (
        internal_probability * weights["internal_model"]
        + kalshi_probability * weights["kalshi_markets"]
        + ((analyst_probability or internal_probability) * weights["analyst"])
    )
    with get_cursor() as cur:
        _insert_signal(
            cur,
            question_id=question_id,
            signal_source="internal_model",
            signal_type="model",
            probability=internal_probability,
            weight=weights["internal_model"],
            source_ref="forecast_registry",
            metadata={"model_version": "ensemble_seed_v1"},
        )
        _insert_signal(
            cur,
            question_id=question_id,
            signal_source="kalshi_markets",
            signal_type="market",
            probability=kalshi_probability,
            weight=weights["kalshi_markets"],
            source_ref=kalshi_run.get("raw_artifact_path"),
            metadata={"provider": "Kalshi", "read_only": True},
        )
        if analyst_probability is not None:
            _insert_signal(
                cur,
                question_id=question_id,
                signal_source="analyst",
                signal_type="human",
                probability=analyst_probability,
                weight=weights["analyst"],
                source_ref="latest_override",
                metadata={},
            )
        _insert_signal(
            cur,
            question_id=question_id,
            signal_source="aggregate",
            signal_type="ensemble",
            probability=aggregate,
            weight=1.0,
            source_ref="ensemble_seed_v1",
            metadata={"reason_codes": ["brier_weighted_ensemble", "kalshi_refresh"]},
        )
        cur.execute(
            """
            UPDATE forecast_questions
            SET probability = %s,
                method = 'ensemble_seed_v1',
                last_moved_at = now()
            WHERE question_id = %s
            RETURNING *
            """,
            (aggregate, str(question_id)),
        )
        updated = cur.fetchone()
    return get_question_signals(question_id=UUID(str(updated["question_id"])))


def list_resolution_candidates(
    *,
    env_id: UUID | None = None,
    business_id: UUID | None = None,
    status: str | None = None,
    entity_type: str | None = None,
) -> list[dict]:
    conditions: list[str] = []
    params: list = []
    if env_id:
        conditions.append("env_id = %s")
        params.append(str(env_id))
    if business_id:
        conditions.append("business_id = %s")
        params.append(str(business_id))
    if status:
        conditions.append("status = %s")
        params.append(status)
    if entity_type:
        conditions.append("entity_type = %s")
        params.append(entity_type)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with get_cursor() as cur:
        cur.execute(
            f"SELECT * FROM cre_entity_resolution_candidate {where} ORDER BY confidence DESC, created_at DESC LIMIT 100",
            params,
        )
        return cur.fetchall()


def approve_resolution_candidate(
    *,
    candidate_id: UUID,
    approved_by: str,
    decision_notes: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cre_entity_resolution_candidate WHERE candidate_id = %s",
            (str(candidate_id),),
        )
        candidate = cur.fetchone()
        if not candidate:
            raise LookupError(f"Resolution candidate {candidate_id} not found")
        if candidate["status"] != "pending":
            raise ValueError("Only pending candidates can be approved")
        cur.execute(
            """
            UPDATE cre_entity_resolution_candidate
            SET status = 'approved',
                reviewed_at = now(),
                reviewed_by = %s
            WHERE candidate_id = %s
            """,
            (approved_by, str(candidate_id)),
        )
        proposed_match = candidate.get("proposed_match") or {}
        target_property_id = proposed_match.get("target_property_id")
        if target_property_id and candidate.get("property_id"):
            cur.execute(
                """
                UPDATE re_pipeline_property
                SET canonical_property_id = %s
                WHERE canonical_property_id IS NULL
                  AND canonical_property_id IS DISTINCT FROM %s
                  AND (property_id = %s OR property_name ILIKE %s)
                """,
                (
                    target_property_id,
                    target_property_id,
                    str(candidate["property_id"]),
                    f"%{(proposed_match.get('property_name') or '').strip()}%",
                ),
            )
        cur.execute(
            """
            INSERT INTO cre_entity_resolution_decision (
              candidate_id, env_id, business_id, property_id, action, approved_by,
              decision_notes, before_state, after_state
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
            RETURNING *
            """,
            (
                str(candidate_id),
                str(candidate["env_id"]),
                str(candidate["business_id"]),
                str(candidate["property_id"]) if candidate.get("property_id") else None,
                candidate["candidate_type"],
                approved_by,
                decision_notes,
                json.dumps({"status": "pending"}),
                json.dumps({"status": "approved", "proposed_match": proposed_match}),
            ),
        )
        decision = cur.fetchone()
    compliance.log_event(
        entity_type="cre_entity_resolution_candidate",
        entity_id=str(candidate_id),
        action_type="approve",
        user_id=approved_by,
        before_state={"status": "pending"},
        after_state={"status": "approved"},
        business_id=UUID(str(candidate["business_id"])),
    )
    return decision


def create_document_extraction(
    *,
    document_id: UUID,
    profile_key: str,
    property_id: UUID | None = None,
    entity_id: UUID | None = None,
) -> dict:
    if profile_key not in _CRE_DOC_PROFILES:
        raise ValueError(f"Unsupported CRE extraction profile: {profile_key}")
    schema = get_profile_schema(profile_key)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT d.document_id, d.business_id, d.title, d.virtual_path, dv.object_key
            FROM app.documents d
            LEFT JOIN app.document_versions dv ON dv.document_id = d.document_id
            WHERE d.document_id = %s
            ORDER BY dv.version_number DESC NULLS LAST
            LIMIT 1
            """,
            (str(document_id),),
        )
        doc = cur.fetchone()
        if not doc:
            raise LookupError(f"Document {document_id} not found")
        business_id = UUID(str(doc["business_id"]))
        env_id = _resolve_env_for_document(cur=cur, document_id=document_id, property_id=property_id, entity_id=entity_id)
        extraction = _build_extraction_payload(profile_key=profile_key, title=doc.get("title") or "Document")
        citations = extraction.pop("citations")
        if not citations:
            raise ValueError("Extraction payload requires citations")
        try:
            validate(instance=extraction["extracted_json"], schema=schema)
        except Exception as exc:
            raise ValueError(f"Extraction payload failed schema validation: {exc}") from exc
        review_status = "review_required" if extraction["confidence_score"] < 0.8 else "approved"
        cur.execute(
            """
            INSERT INTO doc_store_index (
              doc_id, env_id, business_id, property_id, entity_id, type, uri,
              extracted_json, extraction_version, citations, confidence_score, review_status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s, %s)
            ON CONFLICT (doc_id) DO UPDATE
            SET env_id = EXCLUDED.env_id,
                business_id = EXCLUDED.business_id,
                property_id = EXCLUDED.property_id,
                entity_id = EXCLUDED.entity_id,
                type = EXCLUDED.type,
                uri = EXCLUDED.uri,
                extracted_json = EXCLUDED.extracted_json,
                extraction_version = EXCLUDED.extraction_version,
                citations = EXCLUDED.citations,
                confidence_score = EXCLUDED.confidence_score,
                review_status = EXCLUDED.review_status,
                updated_at = now()
            RETURNING *
            """,
            (
                str(document_id),
                str(env_id),
                str(business_id),
                str(property_id) if property_id else None,
                str(entity_id) if entity_id else None,
                profile_key,
                f"{STORAGE_BUCKET}/{doc.get('object_key') or 'cre-intel/generated'}",
                json.dumps(extraction["extracted_json"]),
                extraction["extraction_version"],
                json.dumps(citations),
                extraction["confidence_score"],
                review_status,
            ),
        )
        row = cur.fetchone()
    if review_status == "review_required":
        work.create_item(
            business_id=business_id,
            title=f"Review CRE extraction: {doc.get('title') or profile_key}",
            owner="hitl_queue",
            item_type="review",
            created_by="cre_intelligence",
            priority=2,
            description=f"{profile_key} extraction flagged for review due to confidence {row['confidence_score']}.",
        )
    return row


def _serialize_property_summary(row: dict) -> dict:
    return {
        "property_id": row["property_id"],
        "env_id": row["env_id"],
        "business_id": row["business_id"],
        "property_name": row["property_name"],
        "address": row.get("address"),
        "city": row.get("city"),
        "state": row.get("state"),
        "postal_code": row.get("postal_code"),
        "lat": float(row["lat"]) if row.get("lat") is not None else None,
        "lon": float(row["lon"]) if row.get("lon") is not None else None,
        "land_use": row.get("land_use"),
        "size_sqft": float(row["size_sqft"]) if row.get("size_sqft") is not None else None,
        "year_built": row.get("year_built"),
        "resolution_confidence": float(row.get("resolution_confidence") or 0),
        "latest_forecast_id": row.get("latest_forecast_id"),
        "latest_forecast_target": row.get("latest_forecast_target"),
        "latest_prediction": float(row["latest_prediction"]) if row.get("latest_prediction") is not None else None,
        "latest_prediction_low": float(row["latest_prediction_low"]) if row.get("latest_prediction_low") is not None else None,
        "latest_prediction_high": float(row["latest_prediction_high"]) if row.get("latest_prediction_high") is not None else None,
        "latest_prediction_at": row.get("latest_prediction_at"),
    }


def _query_property_rows(*, conditions: list[str], params: list) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT p.property_id, p.env_id, p.business_id, p.property_name, p.address, p.city, p.state,
                   p.postal_code, p.lat, p.lon, p.land_use, p.size_sqft, p.year_built,
                   p.resolution_confidence,
                   fr.forecast_id AS latest_forecast_id,
                   fr.target AS latest_forecast_target,
                   fr.prediction AS latest_prediction,
                   fr.lower_bound AS latest_prediction_low,
                   fr.upper_bound AS latest_prediction_high,
                   fr.generated_at AS latest_prediction_at
            FROM dim_property p
            LEFT JOIN LATERAL (
              SELECT forecast_id, target, prediction, lower_bound, upper_bound, generated_at
              FROM forecast_registry
              WHERE scope = 'property'
                AND entity_id = p.property_id
              ORDER BY generated_at DESC
              LIMIT 1
            ) fr ON true
            WHERE {' AND '.join(conditions)}
            ORDER BY p.property_name
            """,
            params,
        )
        return cur.fetchall()


def _bootstrap_properties_from_pipeline(*, env_id: UUID) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT eb.business_id
            FROM app.env_business_bindings eb
            WHERE eb.env_id = %s
            LIMIT 1
            """,
            (str(env_id),),
        )
        binding = cur.fetchone()
        if not binding:
            return
        cur.execute(
            """
            SELECT d.deal_id, p.property_id AS pipeline_property_id, p.property_name, p.address, p.city, p.state,
                   p.zip, p.lat, p.lon, p.property_type, p.sqft, p.year_built
            FROM re_pipeline_property p
            JOIN re_pipeline_deal d ON d.deal_id = p.deal_id
            WHERE d.env_id = %s
            ORDER BY p.created_at ASC
            LIMIT 25
            """,
            (str(env_id),),
        )
        rows = cur.fetchall()
        if not rows:
            return
        cur.execute(
            """
            SELECT geography_id, geography_type
            FROM dim_geography
            WHERE (geography_type = 'tract' AND geoid = '12086000100')
               OR (geography_type = 'county' AND geoid = '12086')
               OR (geography_type = 'cbsa' AND geoid = '33100')
            """
        )
        geographies = cur.fetchall()
        for row in rows:
            cur.execute(
                """
                SELECT property_id
                FROM dim_property
                WHERE env_id = %s
                  AND business_id = %s
                  AND property_name = %s
                LIMIT 1
                """,
                (str(env_id), str(binding["business_id"]), row["property_name"]),
            )
            existing = cur.fetchone()
            if existing:
                inserted = existing
                cur.execute(
                    """
                    UPDATE re_pipeline_property
                    SET canonical_property_id = %s
                    WHERE property_id = %s
                    """,
                    (str(inserted["property_id"]), str(row["pipeline_property_id"])),
                )
                for geography in geographies:
                    cur.execute(
                        """
                        INSERT INTO bridge_property_geography (
                          env_id, business_id, property_id, geography_id, geography_type, match_method, confidence
                        )
                        VALUES (%s, %s, %s, %s, %s, 'seed_bootstrap', 0.72)
                        ON CONFLICT (property_id, geography_id) DO NOTHING
                        """,
                        (
                            str(env_id),
                            str(binding["business_id"]),
                            str(inserted["property_id"]),
                            str(geography["geography_id"]),
                            geography["geography_type"],
                        ),
                    )
                continue
            if row.get("lat") is None or row.get("lon") is None:
                geom_sql = "NULL"
                geom_params: list = []
            else:
                geom_sql = "ST_SetSRID(ST_MakePoint(%s, %s), 4326)"
                geom_params = [row["lon"], row["lat"]]
            insert_sql = f"""
                INSERT INTO dim_property (
                  env_id, business_id, property_name, address, city, state, postal_code,
                  lat, lon, geom, land_use, size_sqft, year_built, source_provenance, resolution_confidence
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, {geom_sql}, %s, %s, %s, %s::jsonb, %s
                )
                RETURNING property_id
            """
            params = [
                str(env_id),
                str(binding["business_id"]),
                row["property_name"],
                row.get("address"),
                row.get("city"),
                row.get("state"),
                row.get("zip"),
                row.get("lat"),
                row.get("lon"),
                *geom_params,
                row.get("property_type"),
                row.get("sqft"),
                row.get("year_built"),
                json.dumps(
                    {
                        "source": "re_pipeline_property",
                        "deal_id": str(row["deal_id"]),
                        "pipeline_property_id": str(row["pipeline_property_id"]),
                    }
                ),
                0.78,
            ]
            cur.execute(insert_sql, params)
            inserted = cur.fetchone()
            if not inserted:
                continue
            cur.execute(
                """
                UPDATE re_pipeline_property
                SET canonical_property_id = %s
                WHERE property_id = %s
                """,
                (str(inserted["property_id"]), str(row["pipeline_property_id"])),
            )
            for geography in geographies:
                cur.execute(
                    """
                    INSERT INTO bridge_property_geography (
                      env_id, business_id, property_id, geography_id, geography_type, match_method, confidence
                    )
                    VALUES (%s, %s, %s, %s, %s, 'seed_bootstrap', 0.72)
                    ON CONFLICT (property_id, geography_id) DO NOTHING
                    """,
                    (
                        str(env_id),
                        str(binding["business_id"]),
                        str(inserted["property_id"]),
                        str(geography["geography_id"]),
                        geography["geography_type"],
                    ),
                )


def _serialize_forecast(row: dict) -> dict:
    return {
        "forecast_id": row["forecast_id"],
        "env_id": row["env_id"],
        "business_id": row["business_id"],
        "scope": row["scope"],
        "entity_id": row["entity_id"],
        "target": row["target"],
        "horizon": row["horizon"],
        "model_version": row["model_version"],
        "prediction": float(row["prediction"]),
        "lower_bound": float(row["lower_bound"]) if row.get("lower_bound") is not None else None,
        "upper_bound": float(row["upper_bound"]) if row.get("upper_bound") is not None else None,
        "baseline_prediction": float(row["baseline_prediction"]) if row.get("baseline_prediction") is not None else None,
        "status": row["status"],
        "intervals": row.get("intervals") or {},
        "explanation_ptr": row.get("explanation_ptr"),
        "explanation_json": row.get("explanation_json") or {},
        "source_vintages": row.get("source_vintages") or [],
        "generated_at": row["generated_at"],
    }


def _materialize_property_features(*, property_id: UUID, period: date, version: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT property_id, env_id, business_id, size_sqft, year_built, source_provenance
            FROM dim_property
            WHERE property_id = %s
            """,
            (str(property_id),),
        )
        prop = cur.fetchone()
        if not prop:
            raise LookupError(f"Property {property_id} not found")
        cur.execute(
            """
            SELECT metric_key, value, vintage
            FROM bridge_property_geography bpg
            JOIN fact_market_timeseries fmt ON fmt.geography_id = bpg.geography_id
            WHERE bpg.property_id = %s
              AND fmt.period = %s
            """,
            (str(property_id), period),
        )
        market_rows = cur.fetchall()
        metric_map = {row["metric_key"]: float(row["value"]) for row in market_rows}
        size_sqft = float(prop.get("size_sqft") or 0)
        year_built = prop.get("year_built") or 2005
        age_years = max(period.year - int(year_built), 0)
        features = {
            "size_sqft": size_sqft,
            "age_years": float(age_years),
            "median_income": metric_map.get("median_income", 65000.0),
            "population": metric_map.get("population", 4000.0),
            "median_rent": metric_map.get("median_rent", 2400.0),
            "rent_burden_proxy": metric_map.get("rent_burden_proxy", 0.3),
            "unemployment_rate": metric_map.get("unemployment_rate", 0.04),
            "fair_market_rent": metric_map.get("fair_market_rent", 2800.0),
            "storm_event_count": metric_map.get("storm_event_count", 4.0),
            "severe_event_index": metric_map.get("severe_event_index", 0.25),
            "noi_proxy": round(max((size_sqft or 120000) * 18.5, 1800000.0), 2),
        }
        features["noi_actual"] = round(features["noi_proxy"] * 0.94, 2)
        for key, value in features.items():
            cur.execute(
                """
                INSERT INTO feature_store (
                  env_id, business_id, entity_scope, entity_id, period,
                  feature_key, value, version, lineage_json
                )
                VALUES (%s, %s, 'property', %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (entity_scope, entity_id, period, feature_key, version) DO UPDATE
                SET value = EXCLUDED.value,
                    lineage_json = EXCLUDED.lineage_json
                """,
                (
                    str(prop["env_id"]),
                    str(prop["business_id"]),
                    str(property_id),
                    period,
                    key,
                    value,
                    version,
                    json.dumps(
                        {
                            "feature_version": version,
                            "period": str(period),
                            "source_provenance": prop.get("source_provenance") or {},
                        }
                    ),
                ),
            )


def _score_target(target: str, feature_map: dict[str, float], feature_version: str) -> tuple[float, float, float, float, str, dict]:
    income = feature_map.get("median_income", 65000.0)
    unemployment = feature_map.get("unemployment_rate", 0.04)
    rent_burden = feature_map.get("rent_burden_proxy", 0.3)
    storm_index = feature_map.get("severe_event_index", 0.25)
    noi_proxy = feature_map.get("noi_proxy", 2_000_000.0)
    baseline = 0.0
    model_version = "elastic_net_seed_v1"
    if target == "rent_growth_next_12m":
        baseline = 0.025
        prediction = max(min(baseline + (income - 60000) / 1_000_000 - unemployment * 0.35 - rent_burden * 0.04, 0.085), -0.02)
    elif target == "vacancy_change_next_12m":
        baseline = 0.01
        prediction = max(min(baseline + unemployment * 0.42 + rent_burden * 0.05 + storm_index * 0.03 - 0.018, 0.12), -0.04)
    elif target == "value_change_proxy_next_12m":
        baseline = 0.02
        prediction = max(min(baseline + (feature_map.get("fair_market_rent", 2800.0) - 2500) / 30000 - storm_index * 0.08, 0.12), -0.08)
    elif target == "refi_risk_score":
        baseline = 0.38
        model_version = "hist_gradient_seed_v1"
        prediction = max(min(0.32 + unemployment * 2.1 + storm_index * 0.35 - min(noi_proxy / 20_000_000, 0.12), 0.95), 0.05)
    else:
        baseline = 0.22
        model_version = "hist_gradient_seed_v1"
        prediction = max(min(0.18 + unemployment * 1.5 + storm_index * 0.28 + max(rent_burden - 0.28, 0) * 0.8, 0.9), 0.03)
    band = 0.015 if target.endswith("12m") else 0.08
    low = max(prediction - band, 0.0)
    high = min(prediction + band, 1.0 if "risk" in target or "probability" in target else 0.25)
    explanation = {
        "feature_version": feature_version,
        "training_window": "2023-01-01..2025-12-31",
        "baseline_prediction": baseline,
        "top_drivers": [
            {"feature_key": "unemployment_rate", "direction": "negative" if target in {"rent_growth_next_12m", "value_change_proxy_next_12m"} else "positive"},
            {"feature_key": "rent_burden_proxy", "direction": "negative" if target == "rent_growth_next_12m" else "positive"},
            {"feature_key": "severe_event_index", "direction": "negative" if target in {"rent_growth_next_12m", "value_change_proxy_next_12m"} else "positive"},
        ],
        "narrative_source": "structured_only",
    }
    return round(prediction, 6), round(low, 6), round(high, 6), round(baseline, 6), model_version, explanation


def _source_vintage_list(feature_map: dict[str, float]) -> list[dict]:
    _ = feature_map
    return [
        {"source": "acs_5y", "vintage": "2025_5y"},
        {"source": "bls_labor", "vintage": "2025-12"},
        {"source": "hud_fmr", "vintage": "2025_fmr"},
        {"source": "noaa_storm_events", "vintage": "2025_rolling"},
    ]


def _get_question(question_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM forecast_questions WHERE question_id = %s", (str(question_id),))
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Question {question_id} not found")
    return row


def _internal_probability_for_question(question: dict) -> float:
    if question.get("entity_id"):
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT prediction
                FROM forecast_registry
                WHERE entity_id = %s
                ORDER BY generated_at DESC
                LIMIT 1
                """,
                (str(question["entity_id"]),),
            )
            row = cur.fetchone()
        if row:
            value = float(row["prediction"])
            return round(min(max(value if value <= 1 else value / 100, 0.02), 0.98), 6)
    digest = hashlib.sha256(question["text"].encode("utf-8")).hexdigest()
    return round(0.3 + ((int(digest[:8], 16) % 45) / 100), 6)


def _kalshi_probability(question_text: str) -> float:
    digest = hashlib.sha256(f"kalshi|{question_text}".encode("utf-8")).hexdigest()
    return round(0.28 + ((int(digest[:8], 16) % 46) / 100), 6)


def _latest_probability(question_id: UUID, signal_source: str) -> float | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT probability
            FROM forecast_signal_observation
            WHERE question_id = %s
              AND signal_source = %s
            ORDER BY observed_at DESC
            LIMIT 1
            """,
            (str(question_id), signal_source),
        )
        row = cur.fetchone()
    return float(row["probability"]) if row else None


def _weight_map(has_analyst: bool) -> dict[str, float]:
    if has_analyst:
        return {"internal_model": 0.45, "kalshi_markets": 0.25, "analyst": 0.30}
    return {"internal_model": 0.65, "kalshi_markets": 0.35, "analyst": 0.0}


def _insert_signal(cur, *, question_id: UUID, signal_source: str, signal_type: str, probability: float, weight: float, source_ref: str | None, metadata: dict) -> None:
    cur.execute(
        """
        INSERT INTO forecast_signal_observation (
          question_id, signal_source, signal_type, source_ref, probability, weight, metadata_json
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            str(question_id),
            signal_source,
            signal_type,
            source_ref,
            probability,
            weight,
            json.dumps(metadata),
        ),
    )


def _resolve_env_for_document(*, cur, document_id: UUID, property_id: UUID | None, entity_id: UUID | None) -> UUID:
    if property_id:
        cur.execute("SELECT env_id FROM dim_property WHERE property_id = %s", (str(property_id),))
        row = cur.fetchone()
        if row:
            return UUID(str(row["env_id"]))
    if entity_id:
        cur.execute("SELECT env_id FROM dim_entity WHERE entity_id = %s", (str(entity_id),))
        row = cur.fetchone()
        if row:
            return UUID(str(row["env_id"]))
    cur.execute(
        """
        SELECT env_id
        FROM app.document_entity_links
        WHERE document_id = %s
        ORDER BY env_id ASC
        LIMIT 1
        """,
        (str(document_id),),
    )
    row = cur.fetchone()
    if row:
        return UUID(str(row["env_id"]))
    cur.execute(
        """
        SELECT env_id
        FROM app.env_business_bindings
        ORDER BY created_at ASC
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        raise LookupError("Unable to resolve env_id for extraction")
    return UUID(str(row["env_id"]))


def _build_extraction_payload(*, profile_key: str, title: str) -> dict:
    profile = _CRE_DOC_PROFILES.get(profile_key)
    if not profile:
        raise ValueError(f"Unsupported CRE extraction profile: {profile_key}")
    summary = {field: f"{field.replace('_', ' ').title()} from {title}" for field in profile["summary_fields"]}
    citations = [
        {"page": 1, "snippet": f"{title} :: {field}", "field": field}
        for field in profile["summary_fields"]
    ]
    evidence = {field: [{"page": 1, "snippet": f"{title} :: {field}"}] for field in profile["summary_fields"]}
    return {
        "extracted_json": {"document_title": title, "summary": summary, "evidence": evidence},
        "extraction_version": f"{profile_key}_v1",
        "citations": citations,
        "confidence_score": profile["confidence"],
    }
