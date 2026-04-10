"""History Rhymes service — pgvector retrieval, FastDTW refinement, Rhyme Score.

Implements the read-side of the 6th pillar of the ML Signal Engine. This module
is the FastAPI surface for `POST /api/v1/rhymes/match` (and companion endpoints).

Architecture:
    - Cosine top-K retrieval via pgvector HNSW (`episode_embeddings` table, migration 503)
    - Optional FastDTW refinement on the trailing 60-day signal panel
    - Rhyme Score = 0.6·cosine + 0.3·dtw + 0.1·categorical
    - Era discount applied AFTER Rhyme Score, BEFORE Hoyt amplification (fixed order)
    - Hoyt amplification on top, gated on cycle position proximity to a peak
    - Graceful degradation: returns empty `top_analogs` when `episode_embeddings`
      hasn't been populated yet, instead of 500-ing

Plan reference: skills/historyrhymes/PLAN.md (Sections 5.2, 5.3, 6, 7).

The pipeline that POPULATES `episode_embeddings` lives in
`skills/historyrhymes/notebooks/06_state_vector.py` and runs out-of-band via
the Databricks DAG. Until that runs once, this service returns empty results
with a clear `data_freshness_hours: null` flag in `confidence_meta`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

import psycopg

from app.db import get_cursor


# ── Constants (Sections 5.2 + 5.3) ────────────────────────────────────────────

# Hoyt cycle anchor: 2009-Q1 trough, 18-year cycle (Section 5.3 of PLAN.md)
HOYT_TROUGH_ANCHOR = date(2009, 3, 1)
HOYT_CYCLE_YEARS = 18.0
HOYT_PEAK_PROXIMITY_THRESHOLD = 16.5  # months → years; 17.0 = peak; 16.5 = within 6mo

# Era discount table (Section 5.2). Multipliers compound, floor at 0.50.
ERA_DISCOUNT_FLOOR = 0.50
ERA_DISCOUNT_RULES = [
    # (year_threshold, modality_key, multiplier)
    (1990, "vix_z",          0.85),
    (1996, "hy_oas_z",       0.90),
    (2009, "btc_z",          0.80),
    (2018, "perp_funding_z", 0.90),
]

# Rhyme Score component weights (Section 1 / SKILL.md)
RHYME_W_COSINE = 0.60
RHYME_W_DTW = 0.30
RHYME_W_CATEGORICAL = 0.10


# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class AnalogMatch:
    rank: int
    episode_id: str
    episode_name: str
    rhyme_score: float
    cosine: float
    dtw: float | None
    categorical: float
    era_discount: float
    hoyt_amplification: float
    episode_start_year: int
    is_non_event: bool
    tags: list[str] = field(default_factory=list)


@dataclass
class MatchResponse:
    as_of_date: str
    scope: str
    request_id: str
    latency_ms: int
    top_analogs: list[AnalogMatch]
    scenarios: dict[str, Any]
    trap_detector: dict[str, Any]
    structural_alerts: list[dict[str, Any]]
    confidence_meta: dict[str, Any]


# ── Era discount + Hoyt (Sections 5.2, 5.3) ───────────────────────────────────


def hoyt_cycle_position(d: date) -> float:
    """Return Hoyt 18-year cycle position (0.0 - 17.999) anchored to 2009-Q1 trough."""
    delta_years = (d - HOYT_TROUGH_ANCHOR).days / 365.25
    return delta_years % HOYT_CYCLE_YEARS


def apply_structural_era_discount(
    rhyme_score: float,
    episode_start_year: int,
    current_state: dict[str, Any],
) -> float:
    """Apply multiplicative discount for episodes from eras predating today's modalities.

    See PLAN.md Section 5.2. Order is fixed: era discount BEFORE Hoyt amplification.
    """
    discount = 1.0
    for year_threshold, modality_key, multiplier in ERA_DISCOUNT_RULES:
        if episode_start_year < year_threshold and current_state.get(modality_key) is not None:
            discount *= multiplier
    return rhyme_score * max(discount, ERA_DISCOUNT_FLOOR)


def apply_hoyt_amplification(
    rhyme_score: float,
    episode_tags: list[str],
    current_hoyt_position: float,
) -> float:
    """Boost Rhyme Score for episodes tagged 'hoyt_peak' when current position is near a peak.

    Section 5.3 / 5.5 / 5.6 of PLAN.md flagged the formula as `[CONFIRM]`. Default below:
        - If episode is NOT tagged hoyt_peak: no change.
        - If episode IS tagged AND current position > 16.5: amplify by up to 1.20x linearly.
        - Floor at 1.0 (never reduces a non-peak episode's score).
    """
    if "hoyt_peak" not in episode_tags:
        return rhyme_score
    if current_hoyt_position < HOYT_PEAK_PROXIMITY_THRESHOLD:
        return rhyme_score
    # Linear ramp from 1.0 at position 16.5 to 1.20 at position 18.0
    proximity = (current_hoyt_position - HOYT_PEAK_PROXIMITY_THRESHOLD) / (
        HOYT_CYCLE_YEARS - HOYT_PEAK_PROXIMITY_THRESHOLD
    )
    multiplier = 1.0 + 0.20 * max(0.0, min(1.0, proximity))
    return rhyme_score * multiplier


# ── Rhyme Score composition ───────────────────────────────────────────────────


def _rhyme_score(cosine: float, dtw: float | None, categorical: float) -> float:
    """Compose Rhyme Score from its three components.

    cosine: 0..1 (1 = identical)
    dtw: 0..1 path-similarity (None = not computed; falls back to cosine)
    categorical: 0..1 (regime-type match strength)
    """
    if dtw is None:
        # No DTW yet — re-weight cosine + categorical only
        return (RHYME_W_COSINE + RHYME_W_DTW) * cosine + RHYME_W_CATEGORICAL * categorical
    return RHYME_W_COSINE * cosine + RHYME_W_DTW * dtw + RHYME_W_CATEGORICAL * categorical


# ── Categorical match (regime_type alignment) ─────────────────────────────────


def _categorical_match(episode_regime: str | None, current_regime: str | None) -> float:
    """Cheap regime-label affinity. Mirrors the 04_score_analogs.py rule."""
    if not episode_regime or not current_regime:
        return 0.30
    if episode_regime == current_regime:
        return 0.80
    if "deleveraging" in episode_regime and "tightening" in current_regime:
        return 0.60
    if episode_regime == "crisis":
        return 0.40
    return 0.30


# ── pgvector retrieval ────────────────────────────────────────────────────────


def _pgvector_search(
    cur: psycopg.Cursor,
    state_vector: list[float],
    k: int,
    *,
    end_date_lt: date | None = None,
) -> list[dict[str, Any]]:
    """Cosine top-K retrieval against episode_embeddings.

    Returns rows with: episode_id, name, regime_type, start_date, tags, is_non_event,
    cosine_distance (smaller = more similar).

    end_date_lt: when set (e.g. for the walk-forward backtest), restricts the candidate
    set to episodes that ENDED before this date — enforcing no-lookahead.
    """
    if len(state_vector) != 256:
        raise ValueError(f"state_vector must be 256-dim, got {len(state_vector)}")

    # Format vector as pgvector string literal
    vec_literal = "[" + ",".join(f"{x:.6f}" for x in state_vector) + "]"

    sql = """
        SELECT
            e.id              AS episode_id,
            e.name            AS episode_name,
            e.regime_type     AS regime_type,
            e.start_date      AS start_date,
            e.tags            AS tags,
            e.is_non_event    AS is_non_event,
            ee.embedding <=> %s::vector AS cosine_distance
        FROM public.episode_embeddings ee
        JOIN public.episodes e ON e.id = ee.episode_id
        WHERE ee.embedding_type = 'full_state'
    """
    params: list[Any] = [vec_literal]

    if end_date_lt is not None:
        sql += " AND e.end_date < %s"
        params.append(end_date_lt)

    sql += " ORDER BY ee.embedding <=> %s::vector LIMIT %s"
    params.extend([vec_literal, k])

    cur.execute(sql, params)
    return cur.fetchall()


# ── State vector loader (today's vector from wss_signal_state_vector) ─────────


def _load_current_state_vector(cur: psycopg.Cursor, as_of_date: date) -> dict[str, Any] | None:
    """Load the latest 256-dim state vector at-or-before as_of_date.

    Returns dict with: signal_date, vector (list[float]), modalities (dict).
    Returns None if no row exists.
    """
    cur.execute(
        """
        SELECT signal_date, combined_embedding, reality_vector, data_vector,
               narrative_vector, positioning_vector, meta_vector
        FROM public.wss_signal_state_vector
        WHERE signal_date <= %s
        ORDER BY signal_date DESC
        LIMIT 1
        """,
        [as_of_date],
    )
    row = cur.fetchone()
    if row is None:
        return None

    embedding = row.get("combined_embedding")
    if embedding is None:
        return None

    # `combined_embedding` is JSONB; decode to list[float] if needed
    if isinstance(embedding, str):
        embedding = json.loads(embedding)
    if not isinstance(embedding, list) or len(embedding) != 256:
        return None

    # Modalities — used by era discount to detect which signal types are present today
    # Lightweight: just check whether each pillar vector exists (proxies for "modality is live")
    modalities: dict[str, Any] = {}
    for key in ("vix_z", "hy_oas_z", "btc_z", "perp_funding_z"):
        modalities[key] = None  # default unknown
    # In the production state vector, these slots are positioned in the quant block.
    # For now we just flag them as present if combined_embedding has non-trivial variance
    # in the corresponding indices. The encoder owns the slot mapping.
    # Section 5.2: era discount only kicks in when the modality is non-None today.
    # We populate these from a future ConfigMap; for now, assume all modern modalities are live
    # since 06_state_vector.py runs against today's full feature panel.
    if as_of_date >= date(1990, 1, 2):
        modalities["vix_z"] = 1.0
    if as_of_date >= date(1996, 12, 31):
        modalities["hy_oas_z"] = 1.0
    if as_of_date >= date(2009, 1, 3):
        modalities["btc_z"] = 1.0
    if as_of_date >= date(2018, 1, 1):
        modalities["perp_funding_z"] = 1.0

    return {
        "signal_date": row["signal_date"],
        "vector": embedding,
        "modalities": modalities,
    }


# ── Top-level entry point ─────────────────────────────────────────────────────


def match_analogs(
    *,
    as_of_date: date | None = None,
    scope: str = "global",
    k: int = 5,
    include_narrative: bool = False,
    request_id: str = "",
) -> MatchResponse:
    """Run the full History Rhymes match flow and return the structured response.

    Implements POST /api/v1/rhymes/match per PLAN.md Section 6.

    Graceful degradation modes:
        - episode_embeddings table doesn't exist (migration 503 not applied yet) → empty top_analogs
        - episode_embeddings is empty (Databricks pipeline hasn't run yet)       → empty top_analogs
        - wss_signal_state_vector has no row at-or-before today                  → empty top_analogs

    In all degradation modes, the response is a valid Section 6 envelope with
    confidence_meta.data_freshness_hours = None and an empty top_analogs list,
    so the frontend can render a "no data yet" state instead of erroring.
    """
    started = datetime.now(timezone.utc)
    as_of_date = as_of_date or started.date()
    k = max(1, min(20, k))

    top_analogs: list[AnalogMatch] = []
    structural_alerts: list[dict[str, Any]] = []
    confidence_meta: dict[str, Any] = {
        "agent_agreement": None,
        "permutation_p_value": None,
        "sample_size": 0,
        "data_freshness_hours": None,
    }

    try:
        with get_cursor() as cur:
            # Check that the table exists at all (migration 503 may not be applied yet)
            cur.execute(
                "SELECT to_regclass('public.episode_embeddings') AS exists"
            )
            row = cur.fetchone()
            if row is None or row.get("exists") is None:
                return _build_response(
                    as_of_date=as_of_date,
                    scope=scope,
                    request_id=request_id,
                    started=started,
                    top_analogs=[],
                    structural_alerts=[],
                    confidence_meta={**confidence_meta, "degraded_reason": "episode_embeddings_missing"},
                )

            current_state = _load_current_state_vector(cur, as_of_date)
            if current_state is None:
                return _build_response(
                    as_of_date=as_of_date,
                    scope=scope,
                    request_id=request_id,
                    started=started,
                    top_analogs=[],
                    structural_alerts=[],
                    confidence_meta={**confidence_meta, "degraded_reason": "no_state_vector"},
                )

            rows = _pgvector_search(cur, current_state["vector"], k=max(k * 4, 20))

            if not rows:
                return _build_response(
                    as_of_date=as_of_date,
                    scope=scope,
                    request_id=request_id,
                    started=started,
                    top_analogs=[],
                    structural_alerts=[],
                    confidence_meta={**confidence_meta, "degraded_reason": "empty_episode_embeddings"},
                )

            # Compute Rhyme Score with all corrections, then re-rank
            current_hoyt = hoyt_cycle_position(as_of_date)
            current_regime = None  # TODO: pull from market_state_daily Supabase mirror

            scored: list[AnalogMatch] = []
            for r in rows:
                cosine_distance = float(r["cosine_distance"])
                cosine_sim = max(0.0, 1.0 - cosine_distance)  # pgvector cosine distance: 0=identical
                cat = _categorical_match(r.get("regime_type"), current_regime)

                base_score = _rhyme_score(cosine_sim, dtw=None, categorical=cat)
                episode_year = r["start_date"].year if r.get("start_date") else 2000

                # Order: era discount BEFORE Hoyt amplification (Section 7 rule 6)
                era_discounted = apply_structural_era_discount(
                    base_score, episode_year, current_state["modalities"]
                )
                final_score = apply_hoyt_amplification(
                    era_discounted, list(r.get("tags") or []), current_hoyt
                )

                era_factor = era_discounted / base_score if base_score > 0 else 1.0
                hoyt_factor = final_score / era_discounted if era_discounted > 0 else 1.0

                scored.append(
                    AnalogMatch(
                        rank=0,  # filled below
                        episode_id=str(r["episode_id"]),
                        episode_name=r["episode_name"],
                        rhyme_score=round(final_score, 4),
                        cosine=round(cosine_sim, 4),
                        dtw=None,
                        categorical=round(cat, 4),
                        era_discount=round(era_factor, 4),
                        hoyt_amplification=round(hoyt_factor, 4),
                        episode_start_year=episode_year,
                        is_non_event=bool(r.get("is_non_event")),
                        tags=list(r.get("tags") or []),
                    )
                )

            scored.sort(key=lambda m: m.rhyme_score, reverse=True)
            top_analogs = scored[:k]
            for i, m in enumerate(top_analogs):
                m.rank = i + 1

            # Update confidence_meta
            freshness_hours = (
                (datetime.now(timezone.utc) - datetime.combine(
                    current_state["signal_date"], datetime.min.time(), tzinfo=timezone.utc
                )).total_seconds() / 3600.0
            )
            confidence_meta = {
                "agent_agreement": None,  # populated by stage 5 (multi-agent forecaster)
                "permutation_p_value": None,  # populated by 05_backtest_walk_forward
                "sample_size": len(rows),
                "data_freshness_hours": round(freshness_hours, 2),
            }

            # Pull active structural alerts (Section 5.5)
            cur.execute(
                """
                SELECT id, alert_type, severity, hoyt_position, trigger_signals,
                       narrative, alert_date
                FROM public.structural_alerts
                WHERE acknowledged_at IS NULL
                  AND alert_date >= %s
                ORDER BY alert_date DESC, severity DESC
                LIMIT 10
                """,
                [as_of_date.replace(day=1)],
            )
            for r in cur.fetchall():
                trig = r.get("trigger_signals")
                if isinstance(trig, str):
                    trig = json.loads(trig)
                structural_alerts.append({
                    "id": str(r["id"]),
                    "alert_type": r["alert_type"],
                    "severity": r["severity"],
                    "hoyt_position": float(r["hoyt_position"]) if r.get("hoyt_position") is not None else None,
                    "trigger_signals": trig or {},
                    "narrative": r.get("narrative"),
                    "alert_date": r["alert_date"].isoformat() if r.get("alert_date") else None,
                })

    except psycopg.errors.UndefinedTable:
        return _build_response(
            as_of_date=as_of_date,
            scope=scope,
            request_id=request_id,
            started=started,
            top_analogs=[],
            structural_alerts=[],
            confidence_meta={**confidence_meta, "degraded_reason": "schema_not_applied"},
        )

    return _build_response(
        as_of_date=as_of_date,
        scope=scope,
        request_id=request_id,
        started=started,
        top_analogs=top_analogs,
        structural_alerts=structural_alerts,
        confidence_meta=confidence_meta,
    )


def _build_response(
    *,
    as_of_date: date,
    scope: str,
    request_id: str,
    started: datetime,
    top_analogs: list[AnalogMatch],
    structural_alerts: list[dict[str, Any]],
    confidence_meta: dict[str, Any],
) -> MatchResponse:
    latency_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)

    # Scenarios are written by the multi-agent forecaster (08_multi_agent_forecast.py)
    # to hr_predictions. For now, we surface a neutral baseline so the frontend has
    # something to render. Real values land once Stage 5 of the DAG is built.
    scenarios = {
        "bull": {"probability": 0.25, "narrative": "Awaiting multi-agent forecaster (Stage 5)."},
        "base": {"probability": 0.50, "narrative": "Awaiting multi-agent forecaster (Stage 5)."},
        "bear": {"probability": 0.25, "narrative": "Awaiting multi-agent forecaster (Stage 5)."},
    }

    trap_detector = {
        "trap_flag": False,
        "trap_reason": None,
        "honeypot_match": None,
        "crowding_score": None,
        "consensus_divergence": None,
    }

    return MatchResponse(
        as_of_date=as_of_date.isoformat(),
        scope=scope,
        request_id=request_id,
        latency_ms=latency_ms,
        top_analogs=top_analogs,
        scenarios=scenarios,
        trap_detector=trap_detector,
        structural_alerts=structural_alerts,
        confidence_meta=confidence_meta,
    )


# ── Companion endpoints ───────────────────────────────────────────────────────


def list_episodes(
    *,
    asset_class: str | None = None,
    is_non_event: bool | None = None,
    has_hoyt_peak_tag: bool = False,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """GET /api/v1/rhymes/episodes — list with filters."""
    sql = """
        SELECT id, name, asset_class, category, start_date, end_date,
               max_drawdown_pct, regime_type, dalio_cycle_stage, tags, is_non_event
        FROM public.episodes
        WHERE 1=1
    """
    params: list[Any] = []

    if asset_class is not None:
        sql += " AND asset_class = %s"
        params.append(asset_class)
    if is_non_event is not None:
        sql += " AND is_non_event = %s"
        params.append(is_non_event)
    if has_hoyt_peak_tag:
        sql += " AND %s = ANY(tags)"
        params.append("hoyt_peak")

    sql += " ORDER BY start_date DESC LIMIT %s"
    params.append(limit)

    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "asset_class": r.get("asset_class"),
            "category": r.get("category"),
            "start_date": r["start_date"].isoformat() if r.get("start_date") else None,
            "end_date": r["end_date"].isoformat() if r.get("end_date") else None,
            "max_drawdown_pct": float(r["max_drawdown_pct"]) if r.get("max_drawdown_pct") is not None else None,
            "regime_type": r.get("regime_type"),
            "dalio_cycle_stage": r.get("dalio_cycle_stage"),
            "tags": list(r.get("tags") or []),
            "is_non_event": bool(r.get("is_non_event")),
        }
        for r in rows
    ]


def list_active_alerts(*, alert_type: str | None = None) -> list[dict[str, Any]]:
    """GET /api/v1/rhymes/alerts?type=...&unacknowledged=true"""
    sql = """
        SELECT id, alert_type, severity, hoyt_position, trigger_signals,
               narrative, alert_date, created_at
        FROM public.structural_alerts
        WHERE acknowledged_at IS NULL
    """
    params: list[Any] = []
    if alert_type is not None:
        sql += " AND alert_type = %s"
        params.append(alert_type)
    sql += " ORDER BY alert_date DESC, severity DESC LIMIT 50"

    try:
        with get_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []

    out = []
    for r in rows:
        trig = r.get("trigger_signals")
        if isinstance(trig, str):
            trig = json.loads(trig)
        out.append({
            "id": str(r["id"]),
            "alert_type": r["alert_type"],
            "severity": r["severity"],
            "hoyt_position": float(r["hoyt_position"]) if r.get("hoyt_position") is not None else None,
            "trigger_signals": trig or {},
            "narrative": r.get("narrative"),
            "alert_date": r["alert_date"].isoformat() if r.get("alert_date") else None,
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return out


def acknowledge_alert(alert_id: UUID, acknowledged_by: str) -> bool:
    """POST /api/v1/rhymes/alerts/{id}/acknowledge"""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE public.structural_alerts
            SET acknowledged_at = NOW(),
                acknowledged_by = %s
            WHERE id = %s
              AND acknowledged_at IS NULL
            RETURNING id
            """,
            [acknowledged_by, str(alert_id)],
        )
        return cur.fetchone() is not None
