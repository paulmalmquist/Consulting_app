"""
Opportunity CRUD, composite scoring, stage management, and signal-linking
for the REPE opportunity sourcing layer.

Opportunities are pre-investment hypotheses.  They are fully isolated from
official fund rollups until stage = 'live' (i.e. a real re_investment exists
and re_*_quarter_state rows are populated).
"""
from __future__ import annotations

import logging
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# ── Stage transition rules ────────────────────────────────────────────────────
# Maps current stage → set of allowed next stages.
_STAGE_TRANSITIONS: dict[str, set[str]] = {
    "signal":       {"hypothesis", "archived"},
    "hypothesis":   {"underwriting", "signal", "archived"},
    "underwriting": {"modeled", "hypothesis", "archived"},
    "modeled":      {"ic_ready", "underwriting", "archived"},
    "ic_ready":     {"approved", "modeled", "archived"},
    "approved":     {"live"},             # only via convert-to-investment
    "live":         set(),                # terminal — no further transitions
    "archived":     {"signal"},           # allow re-opening
}

_IMMUTABLE_STAGES = {"approved", "live"}


# ── Pure scoring function (no DB) ─────────────────────────────────────────────

def compute_composite_score(
    score_return_estimated: float | None,
    score_return_modeled: float | None,
    score_source: str,  # 'estimated' | 'modeled'
    score_fund_fit: float | None,
    score_signal: float | None,
    score_execution: float | None,
    score_risk_penalty: float | None,
) -> float:
    """
    Pure composite scoring formula (no DB access):

        active_return = score_return_modeled  (if score_source == 'modeled')
                      = score_return_estimated (otherwise)

        composite = 0.35 * active_return
                  + 0.25 * score_fund_fit
                  + 0.20 * score_signal
                  + 0.10 * score_execution
                  - 0.10 * score_risk_penalty

    Missing components default to 50 (neutral), not 0.
    Result is clamped to [0, 100].
    """
    active_return = score_return_modeled if score_source == "modeled" else score_return_estimated

    def _n(v: float | None) -> float:
        return v if v is not None else 50.0

    raw = (
        0.35 * _n(active_return)
        + 0.25 * _n(score_fund_fit)
        + 0.20 * _n(score_signal)
        + 0.10 * _n(score_execution)
        - 0.10 * _n(score_risk_penalty)
    )
    return round(max(0.0, min(100.0, raw)), 4)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def list_opportunities(
    *,
    env_id: str | UUID,
    stage: str | None = None,
    fund_id: str | UUID | None = None,
    strategy: str | None = None,
    min_score: float | None = None,
    market: str | None = None,
    limit: int = 500,
) -> list[dict]:
    """
    Dense list of opportunities, each annotated with:
    - signal_count from repe_opportunity_signal_links
    - latest_model_run_status from repe_opportunity_model_runs
    """
    env = str(env_id)
    params: list = [env]
    clauses: list[str] = ["o.env_id = %s"]

    if stage:
        clauses.append("o.stage = %s")
        params.append(stage)
    if fund_id:
        clauses.append("o.fund_id = %s")
        params.append(str(fund_id))
    if strategy:
        clauses.append("o.strategy = %s")
        params.append(strategy)
    if min_score is not None:
        clauses.append("o.composite_score >= %s")
        params.append(min_score)
    if market:
        clauses.append("o.market ILIKE %s")
        params.append(f"%{market}%")

    where = " AND ".join(clauses)
    params.append(limit)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                o.opportunity_id, o.env_id, o.fund_id, o.name, o.thesis,
                o.property_type, o.market, o.submarket, o.strategy, o.stage,
                o.priority, o.target_equity_check, o.target_ltv,
                o.score_return_estimated, o.score_return_modeled, o.score_source,
                o.score_fund_fit, o.score_signal, o.score_execution,
                o.score_risk_penalty, o.composite_score,
                o.ai_generated, o.ai_model_version,
                o.current_assumption_version_id, o.promoted_investment_id,
                o.created_by, o.created_at, o.updated_at,
                COALESCE(sig_cnt.cnt, 0)::int AS signal_count,
                mr.status AS latest_model_run_status,
                mr.started_at AS latest_model_run_at
            FROM repe_opportunities o
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS cnt
                FROM repe_opportunity_signal_links sl
                WHERE sl.opportunity_id = o.opportunity_id
            ) sig_cnt ON TRUE
            LEFT JOIN LATERAL (
                SELECT status, started_at
                FROM repe_opportunity_model_runs mr2
                WHERE mr2.opportunity_id = o.opportunity_id
                ORDER BY mr2.started_at DESC
                LIMIT 1
            ) mr ON TRUE
            WHERE {where}
            ORDER BY COALESCE(o.composite_score, 0) DESC, o.created_at DESC
            LIMIT %s
            """,
            params,
        )
        return list(cur.fetchall())


def get_opportunity(opportunity_id: str | UUID) -> dict:
    """Return full opportunity detail or raise LookupError."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.*,
                COALESCE(sig_cnt.cnt, 0)::int AS signal_count
            FROM repe_opportunities o
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS cnt
                FROM repe_opportunity_signal_links sl
                WHERE sl.opportunity_id = o.opportunity_id
            ) sig_cnt ON TRUE
            WHERE o.opportunity_id = %s
            """,
            [str(opportunity_id)],
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"Opportunity {opportunity_id} not found")
    return dict(row)


def create_opportunity(env_id: str | UUID, payload: dict) -> dict:
    """Insert a new opportunity and compute composite score."""
    env = str(env_id)
    p = dict(payload)

    composite = compute_composite_score(
        score_return_estimated=p.get("score_return_estimated"),
        score_return_modeled=p.get("score_return_modeled"),
        score_source=p.get("score_source", "estimated"),
        score_fund_fit=p.get("score_fund_fit"),
        score_signal=p.get("score_signal"),
        score_execution=p.get("score_execution"),
        score_risk_penalty=p.get("score_risk_penalty"),
    )

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_opportunities (
                env_id, fund_id, name, thesis,
                property_type, market, submarket, lat, lon,
                strategy, stage, priority,
                target_equity_check, target_ltv,
                score_return_estimated, score_source,
                score_fund_fit, score_signal, score_execution, score_risk_penalty,
                composite_score,
                ai_generated, ai_model_version, created_by
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s,
                %s, %s, %s
            )
            RETURNING *
            """,
            [
                env,
                p.get("fund_id"),
                p["name"],
                p.get("thesis"),
                p.get("property_type"),
                p.get("market"),
                p.get("submarket"),
                p.get("lat"),
                p.get("lon"),
                p.get("strategy"),
                p.get("stage", "signal"),
                p.get("priority", "medium"),
                p.get("target_equity_check"),
                p.get("target_ltv"),
                p.get("score_return_estimated"),
                p.get("score_source", "estimated"),
                p.get("score_fund_fit"),
                p.get("score_signal"),
                p.get("score_execution"),
                p.get("score_risk_penalty"),
                composite,
                bool(p.get("ai_generated", False)),
                p.get("ai_model_version"),
                p.get("created_by"),
            ],
        )
        row = cur.fetchone()
    return dict(row)


def update_opportunity(opportunity_id: str | UUID, payload: dict) -> dict:
    """Patch an opportunity.  Re-computes composite score if score components change."""
    existing = get_opportunity(opportunity_id)
    p = dict(payload)

    score_fields = {
        "score_return_estimated", "score_return_modeled", "score_source",
        "score_fund_fit", "score_signal", "score_execution", "score_risk_penalty",
    }
    if score_fields.intersection(p.keys()):
        merged = {**existing, **p}
        p["composite_score"] = compute_composite_score(
            score_return_estimated=merged.get("score_return_estimated"),
            score_return_modeled=merged.get("score_return_modeled"),
            score_source=merged.get("score_source", "estimated"),
            score_fund_fit=merged.get("score_fund_fit"),
            score_signal=merged.get("score_signal"),
            score_execution=merged.get("score_execution"),
            score_risk_penalty=merged.get("score_risk_penalty"),
        )

    allowed = {
        "fund_id", "name", "thesis", "property_type", "market", "submarket",
        "lat", "lon", "strategy", "priority", "target_equity_check", "target_ltv",
        "score_return_estimated", "score_return_modeled", "score_source",
        "score_fund_fit", "score_signal", "score_execution", "score_risk_penalty",
        "composite_score", "ai_generated", "ai_model_version",
        "current_assumption_version_id",
    }
    updates = {k: v for k, v in p.items() if k in allowed}
    if not updates:
        return existing

    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [str(opportunity_id)]

    with get_cursor() as cur:
        cur.execute(
            f"UPDATE repe_opportunities SET {set_clauses} WHERE opportunity_id = %s RETURNING *",
            values,
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"Opportunity {opportunity_id} not found")
    return dict(row)


def delete_opportunity(opportunity_id: str | UUID) -> None:
    """Delete an opportunity.  Raises ValueError if stage is approved or live."""
    opp = get_opportunity(opportunity_id)
    if opp["stage"] in _IMMUTABLE_STAGES:
        raise ValueError(
            f"Cannot delete opportunity in stage '{opp['stage']}' — "
            "approved/live opportunities are immutable"
        )
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM repe_opportunities WHERE opportunity_id = %s",
            [str(opportunity_id)],
        )


def advance_stage(opportunity_id: str | UUID, new_stage: str) -> dict:
    """
    Transition an opportunity to a new stage.

    Raises ValueError for illegal transitions.
    Note: 'approved' is set by approve_opportunity() in re_opportunity_model;
          'live' is set by convert_to_investment().  Both are allowed here as
          well so the model service can call this after its own validations.
    """
    opp = get_opportunity(opportunity_id)
    current = opp["stage"]
    allowed = _STAGE_TRANSITIONS.get(current, set())

    if new_stage not in allowed:
        raise ValueError(
            f"Cannot transition opportunity from '{current}' to '{new_stage}'. "
            f"Allowed next stages: {sorted(allowed) or 'none (terminal)'}"
        )

    with get_cursor() as cur:
        cur.execute(
            "UPDATE repe_opportunities SET stage = %s WHERE opportunity_id = %s RETURNING *",
            [new_stage, str(opportunity_id)],
        )
        row = cur.fetchone()
    return dict(row)


# ── Signal linking ─────────────────────────────────────────────────────────────

def link_signal(
    opportunity_id: str | UUID,
    signal_id: str | UUID,
    weight: float = 1.0,
    attribution_note: str | None = None,
) -> dict:
    """
    Create an opportunity ↔ signal link.  Updates score_signal on the opportunity.
    """
    # Verify opportunity exists (raises LookupError)
    opp = get_opportunity(opportunity_id)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_opportunity_signal_links
                (env_id, opportunity_id, signal_id, weight, attribution_note)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (opportunity_id, signal_id) DO UPDATE
                SET weight = EXCLUDED.weight,
                    attribution_note = COALESCE(EXCLUDED.attribution_note, repe_opportunity_signal_links.attribution_note)
            RETURNING *
            """,
            [
                str(opp["env_id"]),
                str(opportunity_id),
                str(signal_id),
                weight,
                attribution_note,
            ],
        )
        link = dict(cur.fetchone())

    # Recompute score_signal
    new_signal_score = _score_signals(opportunity_id)
    _recompute_and_save_composite(opportunity_id, score_signal=new_signal_score)

    return link


def unlink_signal(opportunity_id: str | UUID, signal_id: str | UUID) -> None:
    """Remove a signal link and update score_signal."""
    with get_cursor() as cur:
        cur.execute(
            """
            DELETE FROM repe_opportunity_signal_links
            WHERE opportunity_id = %s AND signal_id = %s
            """,
            [str(opportunity_id), str(signal_id)],
        )

    new_signal_score = _score_signals(opportunity_id)
    _recompute_and_save_composite(opportunity_id, score_signal=new_signal_score)


def get_signal_links(opportunity_id: str | UUID) -> list[dict]:
    """Return all signal links with signal detail for an opportunity."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                sl.link_id, sl.signal_id, sl.weight, sl.attribution_note,
                s.signal_type, s.market, s.submarket,
                s.signal_date, s.strength, s.direction,
                s.signal_headline, s.ai_generated
            FROM repe_opportunity_signal_links sl
            JOIN repe_signals s ON s.signal_id = sl.signal_id
            WHERE sl.opportunity_id = %s
            ORDER BY s.signal_date DESC, s.strength DESC NULLS LAST
            """,
            [str(opportunity_id)],
        )
        return list(cur.fetchall())


# ── Clustering ──────────────────────────────────────────────────────────────────

def cluster_signals_into_opportunity(
    env_id: str | UUID,
    signal_ids: list[str | UUID],
    name: str,
    thesis: str | None = None,
) -> dict:
    """
    Create a new opportunity from a set of signals.
    Derives market and property_type from the most common values in the signal set.
    """
    if not signal_ids:
        raise ValueError("signal_ids must not be empty")

    from app.services.re_signals import get_signal

    markets: list[str] = []
    property_types: list[str] = []
    for sid in signal_ids:
        try:
            s = get_signal(sid)
            if s.get("market"):
                markets.append(s["market"])
            if s.get("property_type"):
                property_types.append(s["property_type"])
        except LookupError:
            pass

    def _mode(lst: list[str]) -> str | None:
        if not lst:
            return None
        return max(set(lst), key=lst.count)

    opp = create_opportunity(
        env_id,
        {
            "name": name,
            "thesis": thesis,
            "market": _mode(markets),
            "property_type": _mode(property_types),
            "stage": "signal",
        },
    )
    for sid in signal_ids:
        try:
            link_signal(opp["opportunity_id"], sid)
        except Exception as exc:  # noqa: BLE001
            logger.warning("cluster_signals: skipped link %s — %s", sid, exc)

    return get_opportunity(opp["opportunity_id"])


# ── Score breakdown ─────────────────────────────────────────────────────────────

def get_score_breakdown(opportunity_id: str | UUID) -> dict:
    """
    Return all 5 score components + composite + score_source label.
    """
    opp = get_opportunity(opportunity_id)
    return {
        "opportunity_id": str(opportunity_id),
        "score_source": opp.get("score_source", "estimated"),
        "score_return_estimated": opp.get("score_return_estimated"),
        "score_return_modeled": opp.get("score_return_modeled"),
        "active_return_score": (
            opp.get("score_return_modeled")
            if opp.get("score_source") == "modeled"
            else opp.get("score_return_estimated")
        ),
        "score_fund_fit": opp.get("score_fund_fit"),
        "score_signal": opp.get("score_signal"),
        "score_execution": opp.get("score_execution"),
        "score_risk_penalty": opp.get("score_risk_penalty"),
        "composite_score": opp.get("composite_score"),
        "notes": {
            "score_return": (
                "Modeled IRR/MOIC-derived score (active)" if opp.get("score_source") == "modeled"
                else "Analyst estimated return score (active)"
            ),
            "score_fund_fit": "6-component fund mandate/geography/concentration/capital/duration/leverage fit",
            "score_signal": "Weighted average strength of linked market signals",
            "score_execution": "Manual execution confidence input",
            "score_risk_penalty": "Manual risk adjustment (subtracted from composite)",
        },
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _score_signals(opportunity_id: str | UUID) -> float | None:
    """Weighted average signal strength from linked signals."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                SUM(s.strength * sl.weight) / NULLIF(SUM(sl.weight), 0) AS weighted_avg
            FROM repe_opportunity_signal_links sl
            JOIN repe_signals s ON s.signal_id = sl.signal_id
            WHERE sl.opportunity_id = %s
            """,
            [str(opportunity_id)],
        )
        row = cur.fetchone()
    if row and row["weighted_avg"] is not None:
        return round(float(row["weighted_avg"]), 4)
    return None


def _score_fund_fit(opportunity_id: str | UUID, fund_id: str | UUID) -> float:
    """
    6-component fund fit score (0–100):

        mandate_match  (0-100): strategy vs fund mandate
        geography_fit  (0-100): market vs fund target geographies
        concentration  (0-100): 100 minus how much adding this deal pushes over limit
        capital_avail  (0-100): target_equity_check vs fund dry powder
        duration_match (0-100): hold_years vs fund remaining life
        leverage_tol   (0-100): proposed LTV vs fund leverage policy

        fund_fit_score = 0.20*mandate + 0.20*geo + 0.20*concentration
                       + 0.15*capital + 0.15*duration + 0.10*leverage

    Returns 50.0 on missing data (neutral).
    Stores fund_fit_breakdown_json in repe_opportunity_fund_impacts if a
    fund-impact row exists; otherwise updates opportunity.score_fund_fit only.
    """
    try:
        opp = get_opportunity(opportunity_id)
        fund_id_str = str(fund_id)

        # Fetch fund state for capital/leverage context
        fund_state = _get_latest_fund_state(fund_id_str)

        # ── Component scoring ──────────────────────────────────────────────
        # 1. Mandate match (strategy alignment)
        opp_strategy = (opp.get("strategy") or "").lower()
        mandate_score = _score_mandate(opp_strategy, fund_id_str)

        # 2. Geography fit
        opp_market = (opp.get("market") or "").lower()
        geo_score = _score_geography(opp_market, fund_id_str)

        # 3. Concentration (simplified: assume moderate unless data present)
        concentration_score = 65.0  # neutral default

        # 4. Capital availability
        cap_score = 50.0
        if fund_state and opp.get("target_equity_check") and fund_state.get("dry_powder"):
            try:
                ec = float(opp["target_equity_check"])
                dp = float(fund_state["dry_powder"])
                if dp > 0:
                    ratio = ec / dp
                    # 100 if ratio < 10%, 0 if ratio > 100%
                    cap_score = max(0.0, min(100.0, (1.0 - ratio) * 100.0))
            except (TypeError, ValueError):
                pass

        # 5. Duration match
        duration_score = 50.0

        # 6. Leverage tolerance
        leverage_score = 50.0
        if opp.get("target_ltv"):
            try:
                ltv = float(opp["target_ltv"])
                # Score higher for lower LTV (conservative)
                leverage_score = max(0.0, min(100.0, (1.0 - ltv) * 150.0))
            except (TypeError, ValueError):
                pass

        fund_fit = (
            0.20 * mandate_score
            + 0.20 * geo_score
            + 0.20 * concentration_score
            + 0.15 * cap_score
            + 0.15 * duration_score
            + 0.10 * leverage_score
        )
        fund_fit_rounded = round(max(0.0, min(100.0, fund_fit)), 2)

        # Persist on opportunity
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE repe_opportunities
                SET score_fund_fit = %s
                WHERE opportunity_id = %s
                """,
                [fund_fit_rounded, str(opportunity_id)],
            )

        return fund_fit_rounded

    except Exception as exc:  # noqa: BLE001
        logger.warning("_score_fund_fit failed for opp=%s fund=%s: %s", opportunity_id, fund_id, exc)
        return 50.0


def _score_mandate(opp_strategy: str, fund_id: str) -> float:
    """Return 0-100 mandate alignment score."""
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT mandate, strategy_focus FROM repe_fund WHERE fund_id = %s",
                [fund_id],
            )
            row = cur.fetchone()
        if row:
            mandate = (row.get("mandate") or "").lower()
            strategy_focus = (row.get("strategy_focus") or "").lower()
            if opp_strategy and (opp_strategy in mandate or opp_strategy in strategy_focus):
                return 90.0
            # Partial match
            strategy_families = {
                "core": {"core", "core_plus"},
                "core_plus": {"core", "core_plus"},
                "value_add": {"value_add", "opportunistic"},
                "opportunistic": {"value_add", "opportunistic", "development"},
                "debt": {"debt"},
                "development": {"development", "opportunistic"},
            }
            compatible = strategy_families.get(opp_strategy, set())
            for kw in compatible:
                if kw in mandate or kw in strategy_focus:
                    return 65.0
    except Exception:  # noqa: BLE001
        pass
    return 50.0


def _score_geography(opp_market: str, fund_id: str) -> float:
    """Return 0-100 geography fit based on fund target markets."""
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT target_geographies FROM repe_fund WHERE fund_id = %s",
                [fund_id],
            )
            row = cur.fetchone()
        if row and row.get("target_geographies") and opp_market:
            target = str(row["target_geographies"]).lower()
            if opp_market in target:
                return 90.0
            # Check state/region partial match
            state_keywords = opp_market.split()
            for kw in state_keywords:
                if len(kw) > 3 and kw in target:
                    return 70.0
    except Exception:  # noqa: BLE001
        pass
    return 50.0


def _get_latest_fund_state(fund_id: str) -> dict | None:
    """Fetch the most recent fund quarter state for capital/leverage context."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT
                    fqs.ending_nav,
                    fqs.uncalled_capital AS dry_powder,
                    fqs.total_debt,
                    fqs.total_equity
                FROM re_fund_quarter_state fqs
                WHERE fqs.fund_id = %s
                ORDER BY fqs.quarter DESC
                LIMIT 1
                """,
                [fund_id],
            )
            row = cur.fetchone()
        return dict(row) if row else None
    except Exception:  # noqa: BLE001
        return None


def _recompute_and_save_composite(
    opportunity_id: str | UUID,
    score_signal: float | None = None,
) -> None:
    """Reload opportunity, optionally override signal score, recompute and persist composite."""
    opp = get_opportunity(opportunity_id)

    effective_signal = score_signal if score_signal is not None else opp.get("score_signal")

    composite = compute_composite_score(
        score_return_estimated=opp.get("score_return_estimated"),
        score_return_modeled=opp.get("score_return_modeled"),
        score_source=opp.get("score_source", "estimated"),
        score_fund_fit=opp.get("score_fund_fit"),
        score_signal=effective_signal,
        score_execution=opp.get("score_execution"),
        score_risk_penalty=opp.get("score_risk_penalty"),
    )

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE repe_opportunities
            SET score_signal = %s, composite_score = %s
            WHERE opportunity_id = %s
            """,
            [effective_signal, composite, str(opportunity_id)],
        )
