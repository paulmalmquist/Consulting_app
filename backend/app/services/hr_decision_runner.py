"""History Rhymes decision runner — execution-layer v1.

Reads time-aligned inputs via `hr_current_state`, applies the execution-layer
decision contract (see `skills/historyrhymes-execution-layer/SKILL.md`), and
writes a single row to `hr_predictions` + one row per position to
`hr_paper_trading_ledger`.

v1 is a deterministic Python port of the decision logic. No LLM call per
decision. v2 may swap to Claude API with the skill as system prompt for
narrative synthesis; the output contract is identical either way.

Usage:
    from app.services.hr_decision_runner import run_daily_decision
    result = run_daily_decision()
    print(result["decision_id"], result["freshness_verdict"], len(result["positions"]))
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# ── Contract constants (from SKILL.md) ────────────────────────────────────────

VALID_REGIMES = {"expansion", "late_cycle", "stagflation", "crisis", "recovery", "unknown"}
VALID_HORIZONS = {7, 30, 90}
MAX_POSITIONS = 5

HIGH_CONVICTION_MIN = 0.6
MEDIUM_CONVICTION_MIN = 0.3
LOW_CONVICTION_MIN = 0.1

CROWDING_CUT_THRESHOLD = 0.7
HONEYPOT_CUT_THRESHOLD = 0.85

ANALOG_GATE_RHYME_PERCENTILE = 0.95  # hard-coded v1: treat rhyme_score >= 0.85 as "above 95th pct of null"
ANALOG_GATE_RHYME_MIN = 0.85
MULTI_AGENT_AGREEMENT_MIN = 0.65

FAILURE_CONFIDENCE_CEILING = 0.4
FAILURE_SIZE_MULTIPLIER = 0.5


# ── Canonical no-input response (matches no_input_response.json) ──────────────

NO_INPUT_RESPONSE: dict[str, Any] = {
    "regime": "unknown",
    "confidence": 0.0,
    "positions": [],
    "risk": {
        "gross_exposure": 0.0,
        "net_exposure": 0.0,
        "max_position_size": 0.0,
        "stop_loss_logic": "no positions taken; inputs missing",
        "volatility_adjustment": "n/a",
    },
    "alerts": [
        {
            "type": "data_quality",
            "message": "Required inputs missing: weekly brief, signal snapshot, or freshness verdict. Cannot allocate.",
            "action": "pause",
        }
    ],
    "execution_tasks": [
        "Supply weekly brief (hr_weekly_briefs) and signal snapshot (hr_signal_snapshots) before re-invoking."
    ],
}


# ── Input types ───────────────────────────────────────────────────────────────


@dataclass
class CurrentState:
    latest_brief_id: UUID | None
    latest_brief_at: datetime | None
    latest_snapshot_id: UUID | None
    latest_snapshot_at: datetime | None
    latest_decision_id: UUID | None
    latest_regime: str | None
    worst_input_age_hours: float
    freshness_verdict: str


@dataclass
class BriefPayload:
    brief_id: UUID
    regime_call: str | None
    parsed_json: dict[str, Any]


@dataclass
class SignalPayload:
    snapshot_id: UUID
    signals_json: dict[str, Any]


# ── Public API ────────────────────────────────────────────────────────────────


def run_daily_decision(source: str = "daily_decision_job") -> dict[str, Any]:
    """Build and persist today's execution-layer decision.

    Returns a dict with the decision payload + provenance fields. Returns the
    canonical no-input response (with `decision_id: None`) if inputs are missing
    per failure mode handling.
    """

    state = _read_current_state()

    if state.freshness_verdict in {"no_brief", "no_snapshot"}:
        logger.info("HR decision: inputs missing (%s) — degraded response, no ledger writes", state.freshness_verdict)
        return {
            **NO_INPUT_RESPONSE,
            "decision_id": None,
            "freshness_verdict": state.freshness_verdict,
            "source_brief_id": None,
            "source_snapshot_id": None,
        }

    brief = _fetch_brief(state.latest_brief_id)  # type: ignore[arg-type]
    signals = _fetch_snapshot(state.latest_snapshot_id)  # type: ignore[arg-type]

    decision = _compose_decision(brief, signals, state)

    decision_id = _persist_decision(decision, brief, signals, source)
    _append_ledger_entries(decision_id, decision["positions"], source)

    return {
        **decision,
        "decision_id": str(decision_id),
        "freshness_verdict": state.freshness_verdict,
        "source_brief_id": str(brief.brief_id),
        "source_snapshot_id": str(signals.snapshot_id),
    }


# ── Readers ───────────────────────────────────────────────────────────────────


def _read_current_state() -> CurrentState:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM hr_current_state;")
        row = cur.fetchone()
    if row is None:
        return CurrentState(
            latest_brief_id=None,
            latest_brief_at=None,
            latest_snapshot_id=None,
            latest_snapshot_at=None,
            latest_decision_id=None,
            latest_regime=None,
            worst_input_age_hours=9999.0,
            freshness_verdict="no_brief",
        )
    return CurrentState(
        latest_brief_id=row["latest_brief_id"],
        latest_brief_at=row["latest_brief_at"],
        latest_snapshot_id=row["latest_snapshot_id"],
        latest_snapshot_at=row["latest_snapshot_at"],
        latest_decision_id=row["latest_decision_id"],
        latest_regime=row["latest_regime"],
        worst_input_age_hours=float(row["worst_input_age_hours"]),
        freshness_verdict=row["freshness_verdict"],
    )


def _fetch_brief(brief_id: UUID) -> BriefPayload:
    with get_cursor() as cur:
        cur.execute(
            "SELECT brief_id, regime_call, parsed_json FROM hr_weekly_briefs WHERE brief_id = %s;",
            (brief_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"hr_weekly_briefs row not found for {brief_id}")
    return BriefPayload(
        brief_id=row["brief_id"],
        regime_call=row["regime_call"],
        parsed_json=row["parsed_json"] or {},
    )


def _fetch_snapshot(snapshot_id: UUID) -> SignalPayload:
    with get_cursor() as cur:
        cur.execute(
            "SELECT snapshot_id, signals_json FROM hr_signal_snapshots WHERE snapshot_id = %s;",
            (snapshot_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"hr_signal_snapshots row not found for {snapshot_id}")
    return SignalPayload(
        snapshot_id=row["snapshot_id"],
        signals_json=row["signals_json"] or {},
    )


# ── Decision composition ──────────────────────────────────────────────────────


def _compose_decision(
    brief: BriefPayload,
    signals: SignalPayload,
    state: CurrentState,
) -> dict[str, Any]:
    """Apply the execution-layer decision logic to form the output envelope."""

    s = signals.signals_json
    regime = _classify_regime(s)

    analogs = brief.parsed_json.get("analogs", []) or []
    top_analog = analogs[0] if analogs else None

    multi_agent = brief.parsed_json.get("multi_agent_forecasts", {}) or {}
    agreement = _multi_agent_agreement(multi_agent)

    analog_gate_cleared = (
        top_analog is not None
        and float(top_analog.get("rhyme_score", 0.0)) >= ANALOG_GATE_RHYME_MIN
    ) or agreement >= MULTI_AGENT_AGREEMENT_MIN

    raw_positions = _derive_candidate_positions(regime, brief.parsed_json, s, top_analog)

    alerts: list[dict[str, Any]] = []
    size_multiplier = 1.0

    if not analog_gate_cleared:
        size_multiplier *= FAILURE_SIZE_MULTIPLIER
        alerts.append({
            "type": "divergence",
            "message": "LOW CONVICTION — analog gate not cleared (rhyme_score < 0.85 and multi-agent agreement < 0.65)",
            "action": "reduce",
        })

    # Red-team override: crowding / honeypot
    honeypots = brief.parsed_json.get("honeypot_alerts", []) or []
    max_honeypot_score = max(
        (float(h.get("score", 0.0)) for h in honeypots),
        default=0.0,
    )
    if max_honeypot_score >= HONEYPOT_CUT_THRESHOLD:
        size_multiplier *= 0.0  # cut 100%
        alerts.append({
            "type": "honeypot",
            "message": f"Honeypot match score {max_honeypot_score:.2f} above cut threshold {HONEYPOT_CUT_THRESHOLD}",
            "action": "pause",
        })

    crowding = float(brief.parsed_json.get("crowding_score", 0.0) or 0.0)
    if crowding > CROWDING_CUT_THRESHOLD:
        size_multiplier *= 0.5
        alerts.append({
            "type": "crowding",
            "message": f"Crowding score {crowding:.2f} above cut threshold {CROWDING_CUT_THRESHOLD}",
            "action": "reduce",
        })

    # Freshness-driven degradation
    if state.freshness_verdict in {"stale_brief", "stale_snapshot"}:
        size_multiplier *= FAILURE_SIZE_MULTIPLIER
        alerts.append({
            "type": "data_quality",
            "message": f"Input freshness verdict: {state.freshness_verdict}",
            "action": "reduce",
        })

    positions = [
        _apply_size_adjustment(p, size_multiplier)
        for p in raw_positions[:MAX_POSITIONS]
    ]

    confidence = _compute_confidence(
        analog_gate_cleared=analog_gate_cleared,
        freshness_verdict=state.freshness_verdict,
        top_analog=top_analog,
        agreement=agreement,
    )
    if state.freshness_verdict in {"stale_brief", "stale_snapshot"} and confidence >= FAILURE_CONFIDENCE_CEILING:
        confidence = min(confidence, FAILURE_CONFIDENCE_CEILING - 0.01)

    risk = _compute_risk(positions)
    execution_tasks = _compose_execution_tasks(positions, alerts, regime)

    return {
        "regime": regime,
        "confidence": round(confidence, 4),
        "positions": positions,
        "risk": risk,
        "alerts": alerts,
        "execution_tasks": execution_tasks,
    }


def _classify_regime(signals: dict[str, Any]) -> str:
    """Map signal state to regime taxonomy. v1 uses coarse thresholds; v2 may refine."""
    yc = _to_float(signals.get("yc_10y2y"))
    vix = _to_float(signals.get("vix_term"))
    credit = _to_float(signals.get("cmbs_delinq"))

    if yc is None or vix is None:
        return "unknown"

    if vix < 0:  # backwardated
        return "crisis"
    if yc < 0 and vix > 1.0 and (credit is not None and credit > 0.05):
        return "stagflation"
    if yc < 0:
        return "late_cycle"
    if yc > 0.5 and vix < 0.8:
        return "expansion"
    if yc > 0 and vix < 1.0:
        return "recovery"
    return "late_cycle"


def _multi_agent_agreement(multi_agent: dict[str, Any]) -> float:
    """Fraction of agents agreeing on dominant direction. Empty = 0.0."""
    if not multi_agent:
        return 0.0
    directions = [a.get("direction") for a in multi_agent.values() if isinstance(a, dict)]
    directions = [d for d in directions if d]
    if not directions:
        return 0.0
    counts: dict[str, int] = {}
    for d in directions:
        counts[d] = counts.get(d, 0) + 1
    return max(counts.values()) / len(directions)


def _derive_candidate_positions(
    regime: str,
    brief_json: dict[str, Any],
    signals: dict[str, Any],
    top_analog: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """v1: derive positions from brief-provided recommendations, falling back to regime-default template.

    The brief's parsed_json may include a `recommended_positions` array. If present, we use it.
    Otherwise, we emit one conservative regime-default position so the loop always produces output.
    """
    recommendations = brief_json.get("recommended_positions", []) or []
    if recommendations:
        positions: list[dict[str, Any]] = []
        for r in recommendations[:MAX_POSITIONS]:
            positions.append(_normalize_position(r, top_analog))
        return positions

    # Regime-default fallback so the daily loop never emits zero positions when inputs exist
    default_asset, default_direction, default_size = _regime_default(regime)
    return [
        {
            "asset": default_asset,
            "direction": default_direction,
            "size": default_size,
            "time_horizon_days": 30,
            "entry_type": "staggered",
            "key_drivers": [f"regime={regime}", "no explicit brief recommendation"],
            "top_analog": (top_analog or {}).get("episode_name", "none"),
            "rhyme_score": float((top_analog or {}).get("rhyme_score", 0.0)),
            "invalidation": f"regime flips out of {regime} (YC or VIX term structure reverses)",
            "next_check": "next daily signal snapshot",
        }
    ]


def _regime_default(regime: str) -> tuple[str, str, float]:
    """Default (asset, direction, size) per regime. Conservative sizes so default never overshoots."""
    return {
        "expansion":    ("SPY",  "long",    0.35),
        "late_cycle":   ("IEF",  "long",    0.25),
        "stagflation":  ("GLD",  "long",    0.30),
        "crisis":       ("VIXY", "long",    0.20),
        "recovery":     ("IWM",  "long",    0.35),
        "unknown":      ("CASH", "neutral", 0.15),
    }.get(regime, ("CASH", "neutral", 0.15))


def _normalize_position(raw: dict[str, Any], top_analog: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce a brief-provided position dict into the strict contract shape."""
    horizon = int(raw.get("time_horizon_days", 30) or 30)
    if horizon not in VALID_HORIZONS:
        # Snap to nearest allowed horizon
        horizon = min(VALID_HORIZONS, key=lambda h: abs(h - horizon))
    size = float(raw.get("size", 0.3) or 0.3)
    size = max(LOW_CONVICTION_MIN, min(1.0, size))
    direction = raw.get("direction", "neutral")
    if direction not in {"long", "short", "neutral"}:
        direction = "neutral"
    entry_type = raw.get("entry_type", "staggered")
    if entry_type not in {"immediate", "staggered", "conditional"}:
        entry_type = "staggered"

    return {
        "asset": str(raw.get("asset", "UNKNOWN")),
        "direction": direction,
        "size": round(size, 4),
        "time_horizon_days": horizon,
        "entry_type": entry_type,
        "key_drivers": list(raw.get("key_drivers") or ["brief recommendation"]),
        "top_analog": str(raw.get("top_analog") or (top_analog or {}).get("episode_name", "none")),
        "rhyme_score": round(float(raw.get("rhyme_score") or (top_analog or {}).get("rhyme_score", 0.0)), 4),
        "invalidation": str(raw.get("invalidation") or "brief recommendation retracted"),
        "next_check": str(raw.get("next_check") or "next weekly brief"),
    }


def _apply_size_adjustment(position: dict[str, Any], multiplier: float) -> dict[str, Any]:
    adjusted = dict(position)
    new_size = round(float(position["size"]) * multiplier, 4)
    adjusted["size"] = max(0.0, min(1.0, new_size))
    return adjusted


def _compute_confidence(
    *,
    analog_gate_cleared: bool,
    freshness_verdict: str,
    top_analog: dict[str, Any] | None,
    agreement: float,
) -> float:
    base = 0.3
    if analog_gate_cleared:
        base += 0.3
    if top_analog and float(top_analog.get("rhyme_score", 0.0)) >= 0.9:
        base += 0.15
    base += 0.25 * agreement
    if freshness_verdict == "fresh":
        base += 0.05
    return max(0.0, min(1.0, base))


def _compute_risk(positions: list[dict[str, Any]]) -> dict[str, Any]:
    if not positions:
        return {
            "gross_exposure": 0.0,
            "net_exposure": 0.0,
            "max_position_size": 0.0,
            "stop_loss_logic": "no positions",
            "volatility_adjustment": "n/a",
        }
    gross = sum(float(p["size"]) for p in positions)
    net = sum(
        float(p["size"]) * (1 if p["direction"] == "long" else -1 if p["direction"] == "short" else 0)
        for p in positions
    )
    max_sz = max(float(p["size"]) for p in positions)
    return {
        "gross_exposure": round(min(gross, 1.0), 4),
        "net_exposure": round(max(-1.0, min(1.0, net)), 4),
        "max_position_size": round(max_sz, 4),
        "stop_loss_logic": "Close on invalidation trigger per position",
        "volatility_adjustment": "v1: none; v2 adds VIX-scaled size reduction",
    }


def _compose_execution_tasks(
    positions: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    regime: str,
) -> list[str]:
    tasks: list[str] = []
    for p in positions:
        tasks.append(
            f"Open {p['direction']} {p['asset']} at size {p['size']:.2f} "
            f"(horizon {p['time_horizon_days']}d, entry {p['entry_type']}); "
            f"invalidate if: {p['invalidation']}"
        )
    for a in alerts:
        tasks.append(f"Alert [{a['type']}] → {a['action']}: {a['message']}")
    if not positions:
        tasks.append(f"No positions this cycle (regime={regime}). Wait for next snapshot.")
    return tasks


# ── Persistence ───────────────────────────────────────────────────────────────


def _persist_decision(
    decision: dict[str, Any],
    brief: BriefPayload,
    signals: SignalPayload,
    source: str,
) -> UUID:
    """Write the envelope to hr_predictions. Returns the new decision id."""
    now = datetime.now(timezone.utc)
    top_rhyme_score = None
    if decision["positions"]:
        top_rhyme_score = decision["positions"][0].get("rhyme_score")

    primary_direction = decision["positions"][0]["direction"] if decision["positions"] else None
    primary_confidence = decision["confidence"]
    primary_horizon = decision["positions"][0]["time_horizon_days"] if decision["positions"] else None

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO hr_predictions (
                prediction_date, asset_class, segment,
                direction, direction_confidence, time_horizon_days,
                rhyme_score, crowding_score, trap_detector_flag,
                synthesis_narrative,
                regime, positions, risk_json, alerts_json, execution_tasks,
                source_brief_id, source_snapshot_id,
                source
            )
            VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s,
                %s, %s, %s, %s, %s,
                %s, %s,
                %s
            )
            RETURNING id;
            """,
            (
                now,
                "multi",
                None,
                primary_direction,
                primary_confidence,
                primary_horizon,
                top_rhyme_score,
                None,  # crowding_score: v2 pulls from brief
                any(a["type"] == "honeypot" for a in decision["alerts"]),
                f"regime={decision['regime']}; {len(decision['positions'])} positions; confidence={primary_confidence}",
                decision["regime"],
                json.dumps(decision["positions"]),
                json.dumps(decision["risk"]),
                json.dumps(decision["alerts"]),
                json.dumps(decision["execution_tasks"]),
                brief.brief_id,
                signals.snapshot_id,
                source,
            ),
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError("hr_predictions insert returned no row")
    return row["id"]


def _append_ledger_entries(decision_id: UUID, positions: list[dict[str, Any]], source: str) -> None:
    if not positions:
        return
    with get_cursor() as cur:
        for p in positions:
            cur.execute(
                """
                INSERT INTO hr_paper_trading_ledger (
                    decision_id, asset, direction, size,
                    time_horizon_days, entry_type, invalidation, source
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    decision_id,
                    p["asset"],
                    p["direction"],
                    float(p["size"]),
                    int(p["time_horizon_days"]),
                    p["entry_type"],
                    p["invalidation"],
                    source,
                ),
            )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
