"""Research-state ingestion and deterministic decision service.

This service owns three things:
1. Parsing weekly market-intelligence briefs into canonical structured state.
2. Computing live-data overlays and provenance for computed-owned fields.
3. Producing one deterministic decision object reused by forecasts, APIs,
   paper-trade enrichment, and portfolio summaries.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from app.db import get_cursor
from app.services.history_rhymes_service import match_analogs


REPO_ROOT = Path(__file__).resolve().parents[3]
BRIEFS_DIR = REPO_ROOT / "docs" / "market-intelligence"
SCHEMA_VERSION = "research_state.v1"
PARSER_VERSION = "brief_parser.v1"
ENGINE_VERSION = "decision_engine.v1"


def _now_date() -> date:
    return datetime.now(timezone.utc).date()


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _json_loads(value: Any, fallback: Any):
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return fallback


def _repo_relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def list_brief_files() -> list[Path]:
    if not BRIEFS_DIR.exists():
        return []
    return sorted(BRIEFS_DIR.glob("*.md"))


def list_market_brief_files() -> list[Path]:
    return [path for path in list_brief_files() if path.name.startswith("regime-")]


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _extract_date_from_path(path: Path) -> date:
    match = re.search(r"(\d{4}-\d{2}-\d{2})", path.name)
    if not match:
        return _now_date()
    return date.fromisoformat(match.group(1))


def _guess_brief_type(path: Path) -> str:
    return "market_regime" if path.name.startswith("regime-") else "segment_brief"


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip().strip("-*")).strip()


def _collect_bullets(section_text: str) -> list[str]:
    out: list[str] = []
    for raw in section_text.splitlines():
        stripped = raw.strip()
        if stripped.startswith(("-", "*")):
            cleaned = _clean_line(stripped)
            if cleaned:
                out.append(cleaned)
    return out


def _extract_section(text: str, heading_terms: list[str]) -> str:
    heading_patterns = [re.escape(term.lower()) for term in heading_terms]
    lines = text.splitlines()
    active = False
    captured: list[str] = []
    for line in lines:
        stripped = line.strip()
        lowered = stripped.lower().lstrip("#").strip()
        is_heading = stripped.startswith("#")
        if is_heading:
            if any(pattern in lowered for pattern in heading_patterns):
                active = True
                continue
            if active:
                break
        if active:
            captured.append(line)
    return "\n".join(captured).strip()


def _find_first(patterns: list[str], text: str, flags: int = re.IGNORECASE) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            return match.group(1).strip()
    return None


def _extract_probabilities(text: str) -> tuple[dict[str, float], list[str]]:
    scenario_terms = {
        "bull": [r"\bbull(?:ish)?\b[^\n%]{0,40}?(\d{1,3})\s*%"],
        "base": [r"\bbase\b[^\n%]{0,40}?(\d{1,3})\s*%"],
        "bear": [r"\bbear(?:ish)?\b[^\n%]{0,40}?(\d{1,3})\s*%"],
    }
    result: dict[str, float] = {}
    warnings: list[str] = []
    for key, patterns in scenario_terms.items():
        value = _find_first(patterns, text)
        if value is not None:
            result[key] = round(float(value) / 100.0, 4)

    total = sum(result.values())
    if total > 0:
        if 0.90 <= total <= 1.10:
            return result, warnings
        warnings.append(f"scenario probabilities sum to {total:.2f}")
    return result, warnings


def parse_brief_markdown(path: str | Path, markdown: str | None = None) -> dict[str, Any]:
    brief_path = Path(path)
    text = markdown if markdown is not None else brief_path.read_text(encoding="utf-8")
    lower = text.lower()

    _regime_section = _extract_section(text, ["regime classification", "regime"])  # noqa: F841
    scenario_section = _extract_section(text, ["scenario", "scenario distribution"])
    instruction_section = _extract_section(text, ["model instructions", "instructions"])
    warning_section = _extract_section(text, ["warnings", "signal warnings", "confidence"])
    divergence_section = _extract_section(text, ["divergence", "what's different", "whats different"])

    regime_label = _find_first(
        [
            r"regime classification[^:\n]*:\s*([^\n]+)",
            r"current regime[^:\n]*:\s*([^\n]+)",
            r"\bregime\b[^:\n]*:\s*([^\n]+)",
        ],
        text,
    )
    if regime_label:
        regime_label = re.sub(r"\s+", " ", regime_label).strip(" -*")

    regime_confidence = _find_first(
        [
            r"regime confidence[^:\n]*:\s*(low|medium|high)",
            r"confidence[^:\n]*:\s*(low|medium|high)",
        ],
        text,
    )
    if regime_confidence:
        regime_confidence = regime_confidence.lower()

    probabilities, probability_warnings = _extract_probabilities("\n".join([text, scenario_section]))

    model_actions = _collect_bullets(instruction_section)
    if not model_actions:
        model_actions = re.findall(r"\b(?:downweight|exclude|expand|reduce|override|widen)_[a-z_]+\b", lower)

    warnings = _collect_bullets(warning_section)
    if not warnings:
        warnings = [
            _clean_line(match.group(0))
            for match in re.finditer(
                r"(?:low confidence|degraded|stale|ambiguous|ignore|exclude)[^\n.]{0,120}",
                text,
                re.IGNORECASE,
            )
        ]

    divergences = _collect_bullets(divergence_section)
    if not divergences:
        divergences = [
            _clean_line(match.group(1))
            for match in re.finditer(r"(?:divergence|different this time)[:\-]\s*([^\n]+)", text, re.IGNORECASE)
        ]

    conflicting_regimes = re.findall(r"regime classification[^:\n]*:\s*([^\n]+)", text, re.IGNORECASE)
    conflicting_regimes = [re.sub(r"\s+", " ", item).strip(" -*").lower() for item in conflicting_regimes]

    core_hits = sum(
        [
            1 if regime_label else 0,
            1 if regime_confidence else 0,
            1 if probabilities else 0,
            1 if model_actions or warnings else 0,
        ]
    )
    parse_warnings = list(dict.fromkeys([*probability_warnings, *warnings]))
    missing_fields: list[str] = []
    if not regime_label:
        missing_fields.append("regime_label")
    if not regime_confidence:
        missing_fields.append("regime_confidence")
    if not probabilities:
        missing_fields.append("scenario_distribution_json")
    if not model_actions and not warnings:
        missing_fields.append("model_actions_or_warnings")

    ambiguous = len(set(conflicting_regimes)) > 1
    if ambiguous:
        parse_status = "ambiguous"
        parse_warnings.append("conflicting regime labels detected")
    elif core_hits == 4 and not probability_warnings:
        parse_status = "complete"
    elif core_hits >= 2:
        parse_status = "partial"
    else:
        parse_status = "failed"

    parse_confidence_map = {
        "complete": 0.92,
        "partial": 0.64,
        "ambiguous": 0.34,
        "failed": 0.12,
    }
    parse_confidence = parse_confidence_map[parse_status]
    parse_confidence = _clamp(parse_confidence - min(len(parse_warnings), 4) * 0.05)

    return {
        "state_date": _extract_date_from_path(brief_path),
        "regime_label": regime_label,
        "regime_confidence": regime_confidence,
        "scenario_distribution_json": probabilities,
        "model_actions": list(dict.fromkeys(model_actions)),
        "divergences": list(dict.fromkeys(divergences)),
        "parse_status": parse_status,
        "parse_confidence": round(parse_confidence, 4),
        "parse_warnings_json": list(dict.fromkeys(parse_warnings)),
        "missing_fields_json": missing_fields,
        "raw_text": text,
        "brief_type": _guess_brief_type(brief_path),
        "source_path": _repo_relative(brief_path),
        "source_hash": _hash_text(text),
    }


def _fetch_scalar(cur, sql: str, params: list[Any] | tuple[Any, ...] | None = None, key: str = "value") -> Any:
    cur.execute(sql, params or [])
    row = cur.fetchone()
    if not row:
        return None
    return row.get(key)


def _days_since(value: date | None) -> int | None:
    if value is None:
        return None
    return max(0, (_now_date() - value).days)


def _freshness_component(days_lag: int | None, expected_days: int) -> float:
    if days_lag is None:
        return 0.2
    if days_lag <= expected_days:
        return round(0.8 + (1 - (days_lag / max(expected_days, 1))) * 0.2, 4)
    if days_lag <= expected_days * 2:
        ratio = (days_lag - expected_days) / max(expected_days, 1)
        return round(0.5 + (1 - ratio) * 0.3, 4)
    excess = min(days_lag - expected_days * 2, expected_days * 4)
    return round(max(0.2, 0.5 - (excess / max(expected_days * 4, 1)) * 0.3), 4)


def _freshness_provenance(signal_dates: dict[str, date | None]) -> tuple[float, dict[str, Any]]:
    cadences = {
        "reality": 7,
        "data": 30,
        "narrative": 2,
        "positioning": 2,
        "meta": 2,
    }
    by_family: dict[str, Any] = {}
    scores: list[float] = []
    for family, cadence in cadences.items():
        lag = _days_since(signal_dates.get(family))
        component = _freshness_component(lag, cadence)
        scores.append(component)
        by_family[family] = {
            "latest_date": signal_dates.get(family).isoformat() if signal_dates.get(family) else None,
            "days_lag": lag,
            "expected_days": cadence,
            "score": component,
        }
    return round(sum(scores) / len(scores), 4), by_family


def _trend_score(rows: list[dict[str, Any]], positive_terms: tuple[str, ...], negative_terms: tuple[str, ...]) -> float | None:
    scores: list[float] = []
    for row in rows:
        metric = str(row.get("metric_name") or row.get("name") or "").lower()
        trend = str(row.get("trend_direction") or row.get("trend") or "").lower()
        surprise = row.get("surprise_score")
        value = row.get("value")
        score: float | None = None
        if any(term in metric for term in positive_terms):
            if trend in {"up", "rising", "accelerating", "positive"}:
                score = 0.75
            elif trend in {"down", "falling", "decelerating", "negative"}:
                score = 0.25
        elif any(term in metric for term in negative_terms):
            if trend in {"up", "rising", "accelerating", "positive"}:
                score = 0.25
            elif trend in {"down", "falling", "decelerating", "negative"}:
                score = 0.75
        if score is None and surprise is not None:
            score = _clamp(0.5 + float(surprise) / 4.0)
        if score is None and value is not None:
            try:
                score = _clamp(0.5 + float(value) / 100.0)
            except Exception:
                score = None
        if score is not None:
            scores.append(score)
    if not scores:
        return None
    return round(sum(scores) / len(scores), 4)


def _compute_live_metrics(state_date: date, brief_text: str) -> dict[str, Any]:
    data_quality_flags: dict[str, Any] = {}
    with get_cursor() as cur:
        signal_dates = {
            "reality": _fetch_scalar(cur, "SELECT MAX(signal_date) AS value FROM public.wss_reality_signals"),
            "data": _fetch_scalar(cur, "SELECT MAX(signal_date) AS value FROM public.wss_data_signals"),
            "narrative": _fetch_scalar(cur, "SELECT MAX(signal_date) AS value FROM public.wss_narrative_state"),
            "positioning": _fetch_scalar(cur, "SELECT MAX(signal_date) AS value FROM public.wss_positioning_signals"),
            "meta": _fetch_scalar(cur, "SELECT MAX(signal_date) AS value FROM public.wss_meta_signals"),
        }
        freshness_score, freshness_meta = _freshness_provenance(signal_dates)

        cur.execute(
            """
            SELECT metric_name, trend_direction, surprise_score, reported_value, expected_value
            FROM public.wss_data_signals
            WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_data_signals)
            """
        )
        data_rows = cur.fetchall()
        cur.execute(
            """
            SELECT metric_name, value, trend_direction, confidence_score
            FROM public.wss_reality_signals
            WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_reality_signals)
            """
        )
        reality_rows = cur.fetchall()
        cur.execute(
            """
            SELECT trap_probability, adversarial_risk_score, cross_layer_alignment, explanation
            FROM public.wss_meta_signals
            WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_meta_signals)
            ORDER BY trap_probability DESC NULLS LAST
            """
        )
        meta_rows = cur.fetchall()

        growth_score = _trend_score(
            data_rows + reality_rows,
            ("pmi", "payroll", "jobs", "employment", "retail", "housing starts", "gdp"),
            ("jobless", "claims", "delinquency"),
        )
        inflation_score = _trend_score(
            data_rows,
            ("disinflation",),
            ("cpi", "pce", "inflation", "wage"),
        )
        credit_score = _trend_score(
            data_rows + reality_rows,
            ("spread tightening",),
            ("hy", "cmbs", "delinquency", "default", "charge", "stress"),
        )
        policy_score = _trend_score(
            data_rows + reality_rows,
            ("rate cut", "easing", "liquidity"),
            ("tightening", "fed funds", "qt", "real rates"),
        )

        family_scores = [
            score if score is not None else 0.5
            for score in (growth_score, inflation_score, credit_score, policy_score)
        ]
        if growth_score is None:
            data_quality_flags["growth_signal_sparse"] = True
        if inflation_score is None:
            data_quality_flags["inflation_signal_sparse"] = True
        if credit_score is None:
            data_quality_flags["credit_signal_sparse"] = True
        if policy_score is None:
            data_quality_flags["policy_signal_sparse"] = True

        mean_score = sum(family_scores) / len(family_scores)
        variance = sum((score - mean_score) ** 2 for score in family_scores) / len(family_scores)
        coherence_score = round(_clamp(1.0 - (variance ** 0.5) * 1.6), 4)

        brief_lower = brief_text.lower()
        exogenous_terms = ("oil shock", "geopolitical", "war", "tariff", "sanction", "attack", "embargo", "earthquake", "disaster")
        endogenous_terms = ("credit", "housing", "consumer", "bank", "liquidity", "earnings", "deleveraging", "balance sheet")
        exogenous_score = sum(1 for term in exogenous_terms if term in brief_lower)
        endogenous_score = sum(1 for term in endogenous_terms if term in brief_lower)
        if any("oil" in str(row.get("metric_name") or "").lower() for row in reality_rows + data_rows):
            exogenous_score += 1
        if any(term in str(row.get("metric_name") or "").lower() for row in reality_rows + data_rows for term in ("credit", "cmbs", "default", "delinquency")):
            endogenous_score += 1

        if exogenous_score >= endogenous_score + 2:
            shock_type = "exogenous"
        elif endogenous_score >= exogenous_score + 2:
            shock_type = "endogenous"
        else:
            shock_type = "mixed"
        shock_dominance = round(_clamp(abs(exogenous_score - endogenous_score) / max(exogenous_score + endogenous_score, 1)), 4)

        def _segment_score(terms: tuple[str, ...]) -> float:
            matched = [
                row for row in (reality_rows + data_rows)
                if any(term in str(row.get("metric_name") or "").lower() for term in terms)
            ]
            score = _trend_score(matched, tuple(), terms)
            return round(1 - score if score is not None else 0.35, 4)

        credit_regime = {
            "cre_stress": _segment_score(("cmbs", "office", "vacancy", "cre", "mortgage")),
            "corporate_stress": _segment_score(("hy", "ig", "default", "spread", "corporate")),
            "consumer_stress": _segment_score(("bnpl", "credit card", "consumer", "auto loan", "charge")),
        }

        vix_level = _fetch_scalar(
            cur,
            """
            SELECT value AS value
            FROM fact_market_timeseries
            WHERE ticker = 'VIX' AND metric IN ('close', 'value')
            ORDER BY as_of_date DESC
            LIMIT 1
            """,
        )
        move_level = _fetch_scalar(
            cur,
            """
            SELECT value AS value
            FROM fact_market_timeseries
            WHERE ticker = 'MOVE' AND metric IN ('close', 'value')
            ORDER BY as_of_date DESC
            LIMIT 1
            """,
        )
        if move_level is None:
            data_quality_flags["move_unavailable"] = True
        vol_divergence_score = None
        if vix_level is not None and move_level is not None:
            move_norm = _clamp((float(move_level) - 80.0) / 80.0)
            vix_norm = _clamp((float(vix_level) - 12.0) / 28.0)
            vol_divergence_score = round(_clamp(0.5 + (move_norm - vix_norm) / 2.0), 4)
        volatility_regime = {
            "vix_level": float(vix_level) if vix_level is not None else None,
            "move_level": float(move_level) if move_level is not None else None,
            "vol_divergence_score": vol_divergence_score,
        }

        top_analogs = []
        analog_significance = {
            "null_distribution_method": "heuristic_rhyme_score_gate_v1",
            "sample_size": 0,
            "significance_percentile": 0,
            "p_value": None,
            "is_significant": False,
        }
        try:
            analog_result = match_analogs(as_of_date=state_date, scope="global", k=3, request_id=f"research-{state_date.isoformat()}")
            top_analogs = [
                {"episode": analog.episode_name, "score": analog.rhyme_score}
                for analog in analog_result.top_analogs
            ]
            top_score = float(top_analogs[0]["score"]) if top_analogs else 0.0
            percentile = round(top_score * 100, 2)
            p_value = round(max(0.001, 1.0 - top_score), 4) if top_analogs else None
            analog_significance = {
                "null_distribution_method": "heuristic_rhyme_score_gate_v1",
                "sample_size": int(analog_result.confidence_meta.get("sample_size") or len(top_analogs)),
                "significance_percentile": percentile,
                "p_value": p_value,
                "is_significant": bool(percentile >= 95 or (p_value is not None and p_value <= 0.05)),
            }
        except Exception:
            data_quality_flags["analog_match_unavailable"] = True

        adversarial_values = [
            float(row.get("adversarial_risk_score") or row.get("trap_probability") or 0)
            for row in meta_rows
            if row.get("adversarial_risk_score") is not None or row.get("trap_probability") is not None
        ]
        adversarial_risk = round(sum(adversarial_values) / len(adversarial_values), 4) if adversarial_values else 0.45

    return {
        "signal_freshness_score": freshness_score,
        "signal_freshness_meta": freshness_meta,
        "signal_coherence_index": coherence_score,
        "family_scores": {
            "growth": growth_score,
            "inflation": inflation_score,
            "credit": credit_score,
            "policy": policy_score,
        },
        "shock_type": shock_type,
        "shock_dominance_score": shock_dominance,
        "credit_regime_json": credit_regime,
        "volatility_regime_json": volatility_regime,
        "data_quality_flags": data_quality_flags,
        "top_analogs": top_analogs,
        "analog_significance_json": analog_significance,
        "adversarial_risk": adversarial_risk,
    }


def _field_provenance_rows(state_id: str, parsed: dict[str, Any], live: dict[str, Any]) -> list[dict[str, Any]]:
    parsed_fields = {"state_date", "regime_label", "regime_confidence", "scenario_distribution_json", "divergences", "model_actions"}
    computed_fields = {
        "signal_freshness_score",
        "signal_coherence_index",
        "shock_type",
        "shock_dominance_score",
        "credit_regime_json",
        "volatility_regime_json",
        "data_quality_flags",
        "top_analogs",
        "analog_significance_json",
        "adversarial_risk",
    }
    rows: list[dict[str, Any]] = []
    for field in sorted(parsed_fields | computed_fields):
        if field in parsed_fields:
            value = parsed.get(field)
            rows.append(
                {
                    "research_state_id": state_id,
                    "field_name": field,
                    "value_source": "parsed_brief" if value not in (None, {}, [], "") else "inferred_fallback",
                    "source_type": "markdown_brief",
                    "source_ref": parsed.get("source_path"),
                    "derivation_method": "fuzzy_section_parser",
                    "source_confidence": parsed.get("parse_confidence"),
                    "is_missing": value in (None, {}, [], ""),
                    "is_ambiguous": parsed.get("parse_status") == "ambiguous" and field in {"regime_label", "regime_confidence"},
                }
            )
        elif field in computed_fields:
            rows.append(
                {
                    "research_state_id": state_id,
                    "field_name": field,
                    "value_source": "computed_live",
                    "source_type": "live_market_tables",
                    "source_ref": "wss+fact_market_timeseries",
                    "derivation_method": "research_state_engine_v1",
                    "source_confidence": 0.82,
                    "is_missing": live.get(field) is None,
                    "is_ambiguous": False,
                }
            )
    return rows


def _load_previous_state(cur, state_date: date, scope_type: str, scope_key: str) -> dict[str, Any] | None:
    cur.execute(
        """
        SELECT *
        FROM public.research_state
        WHERE scope_type = %s AND scope_key = %s AND state_date < %s
        ORDER BY state_date DESC
        LIMIT 1
        """,
        (scope_type, scope_key, state_date),
    )
    return cur.fetchone()


def _compute_confidence_delta(parsed: dict[str, Any], live: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    current = round(
        _clamp(
            0.45 * float(live.get("signal_coherence_index") or 0.5)
            + 0.35 * float(live.get("signal_freshness_score") or 0.5)
            + 0.20 * float(parsed.get("parse_confidence") or 0.0)
        )
        * 100,
        2,
    )
    prev_value = None
    prev_coherence = None
    prev_freshness = None
    prev_parse = None
    if previous:
        prev_coherence = float(previous.get("signal_coherence_index") or 0.5)
        prev_freshness = float(previous.get("signal_freshness_score") or 0.5)
        prev_parse = float(previous.get("parse_confidence") or 0.0)
        prev_value = round(_clamp(0.45 * prev_coherence + 0.35 * prev_freshness + 0.20 * prev_parse) * 100, 2)
    reasons: list[str] = []
    if previous:
        coherence_delta = float(live.get("signal_coherence_index") or 0.5) - (prev_coherence or 0.5)
        freshness_delta = float(live.get("signal_freshness_score") or 0.5) - (prev_freshness or 0.5)
        if coherence_delta <= -0.08:
            reasons.append(f"confidence down because coherence fell {abs(coherence_delta) * 100:.0f} pts")
        elif coherence_delta >= 0.08:
            reasons.append(f"confidence up because coherence improved {coherence_delta * 100:.0f} pts")
        if freshness_delta <= -0.08:
            reasons.append(f"confidence down because signal freshness fell {abs(freshness_delta) * 100:.0f} pts")
        elif freshness_delta >= 0.08:
            reasons.append(f"confidence up because signal freshness improved {freshness_delta * 100:.0f} pts")
        if parsed.get("parse_status") != previous.get("parse_status"):
            reasons.append(f"parse status moved from {previous.get('parse_status')} to {parsed.get('parse_status')}")
    elif parsed.get("parse_status") != "complete":
        reasons.append(f"initial confidence constrained by parse status {parsed.get('parse_status')}")
    return {
        "previous": prev_value,
        "current": current,
        "delta_points": round(current - (prev_value or current), 2) if prev_value is not None else 0.0,
        "reasons": reasons,
    }


def _upsert_research_state(parsed: dict[str, Any], live: dict[str, Any], scope_type: str, scope_key: str = "global", parent_state_id: str | None = None) -> dict[str, Any]:
    with get_cursor() as cur:
        previous = _load_previous_state(cur, parsed["state_date"], scope_type, scope_key)
        confidence_delta = _compute_confidence_delta(parsed, live, previous)
        cur.execute(
            """
            INSERT INTO public.research_state (
                state_date, scope_type, scope_key, parent_state_id,
                regime_label, regime_confidence,
                signal_freshness_score, signal_coherence_index,
                shock_type, shock_dominance_score,
                credit_regime_json, volatility_regime_json,
                data_quality_flags, top_analogs, analog_significance_json,
                divergences, model_actions, scenario_distribution_json,
                parse_status, parse_confidence, parse_warnings_json, missing_fields_json,
                confidence_delta_json, source_path, source_hash, brief_type,
                schema_version, parser_version, engine_version
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s::jsonb, %s::jsonb,
                %s::jsonb, %s::jsonb, %s::jsonb,
                %s::jsonb, %s::jsonb, %s::jsonb,
                %s, %s, %s::jsonb, %s::jsonb,
                %s::jsonb, %s, %s, %s,
                %s, %s, %s
            )
            ON CONFLICT (state_date, scope_type, scope_key, source_hash)
            DO UPDATE SET
                parent_state_id = EXCLUDED.parent_state_id,
                regime_label = EXCLUDED.regime_label,
                regime_confidence = EXCLUDED.regime_confidence,
                signal_freshness_score = EXCLUDED.signal_freshness_score,
                signal_coherence_index = EXCLUDED.signal_coherence_index,
                shock_type = EXCLUDED.shock_type,
                shock_dominance_score = EXCLUDED.shock_dominance_score,
                credit_regime_json = EXCLUDED.credit_regime_json,
                volatility_regime_json = EXCLUDED.volatility_regime_json,
                data_quality_flags = EXCLUDED.data_quality_flags,
                top_analogs = EXCLUDED.top_analogs,
                analog_significance_json = EXCLUDED.analog_significance_json,
                divergences = EXCLUDED.divergences,
                model_actions = EXCLUDED.model_actions,
                scenario_distribution_json = EXCLUDED.scenario_distribution_json,
                parse_status = EXCLUDED.parse_status,
                parse_confidence = EXCLUDED.parse_confidence,
                parse_warnings_json = EXCLUDED.parse_warnings_json,
                missing_fields_json = EXCLUDED.missing_fields_json,
                confidence_delta_json = EXCLUDED.confidence_delta_json,
                brief_type = EXCLUDED.brief_type,
                schema_version = EXCLUDED.schema_version,
                parser_version = EXCLUDED.parser_version,
                engine_version = EXCLUDED.engine_version,
                updated_at = now()
            RETURNING *
            """,
            (
                parsed["state_date"],
                scope_type,
                scope_key,
                parent_state_id,
                parsed.get("regime_label"),
                parsed.get("regime_confidence"),
                live.get("signal_freshness_score"),
                live.get("signal_coherence_index"),
                live.get("shock_type"),
                live.get("shock_dominance_score"),
                json.dumps(live.get("credit_regime_json") or {}),
                json.dumps(live.get("volatility_regime_json") or {}),
                json.dumps(live.get("data_quality_flags") or {}),
                json.dumps(live.get("top_analogs") or []),
                json.dumps(live.get("analog_significance_json") or {}),
                json.dumps(parsed.get("divergences") or []),
                json.dumps(parsed.get("model_actions") or []),
                json.dumps(parsed.get("scenario_distribution_json") or {}),
                parsed.get("parse_status"),
                parsed.get("parse_confidence"),
                json.dumps(parsed.get("parse_warnings_json") or []),
                json.dumps(parsed.get("missing_fields_json") or []),
                json.dumps(confidence_delta),
                parsed.get("source_path"),
                parsed.get("source_hash"),
                parsed.get("brief_type"),
                SCHEMA_VERSION,
                PARSER_VERSION,
                ENGINE_VERSION,
            ),
        )
        row = cur.fetchone()
        state_id = str(row["id"])
        provenance_rows = _field_provenance_rows(state_id, parsed, live)
        for item in provenance_rows:
            cur.execute(
                """
                INSERT INTO public.research_state_field_provenance (
                    research_state_id, field_name, value_source, source_type, source_ref,
                    derivation_method, source_confidence, is_missing, is_ambiguous
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (research_state_id, field_name)
                DO UPDATE SET
                    value_source = EXCLUDED.value_source,
                    source_type = EXCLUDED.source_type,
                    source_ref = EXCLUDED.source_ref,
                    derivation_method = EXCLUDED.derivation_method,
                    source_confidence = EXCLUDED.source_confidence,
                    is_missing = EXCLUDED.is_missing,
                    is_ambiguous = EXCLUDED.is_ambiguous
                """,
                (
                    item["research_state_id"],
                    item["field_name"],
                    item["value_source"],
                    item["source_type"],
                    item["source_ref"],
                    item["derivation_method"],
                    item["source_confidence"],
                    item["is_missing"],
                    item["is_ambiguous"],
                ),
            )
    return row


def ingest_brief(path: str | Path, *, scope_type: str = "market", scope_key: str = "global") -> dict[str, Any]:
    brief_path = Path(path)
    parsed = parse_brief_markdown(brief_path)
    live = _compute_live_metrics(parsed["state_date"], parsed["raw_text"])
    return _upsert_research_state(parsed, live, scope_type=scope_type, scope_key=scope_key)


def ensure_market_state_synced() -> dict[str, Any] | None:
    market_files = list_market_brief_files()
    if not market_files:
        return None
    latest_row = None
    for path in market_files:
        latest_row = ingest_brief(path, scope_type="market", scope_key="global")
    return latest_row


def _scope_chain(row: dict[str, Any]) -> list[dict[str, Any]]:
    chain = [
        {
            "scope_type": row.get("scope_type"),
            "scope_key": row.get("scope_key"),
            "state_id": str(row.get("id")),
            "state_date": row.get("state_date").isoformat() if row.get("state_date") else None,
        }
    ]
    return chain


def _load_provenance(cur, research_state_id: str) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT field_name, value_source, source_type, source_ref, derivation_method,
               source_confidence, is_missing, is_ambiguous
        FROM public.research_state_field_provenance
        WHERE research_state_id = %s
        ORDER BY field_name
        """,
        (research_state_id,),
    )
    return cur.fetchall()


def _load_latest_forecast(cur, research_state_id: str | None = None) -> dict[str, Any] | None:
    sql = """
        SELECT id, prediction_date, scenario_bull_prob, scenario_base_prob, scenario_bear_prob,
               rhyme_score, forecast_confidence, scenario_dispersion_score,
               adversarial_risk, agent_agreement_score, invalidation_triggers_json,
               deterministic_decision_json, research_context_json, top_analog_id
        FROM public.hr_predictions
    """
    params: list[Any] = []
    if research_state_id is not None:
        sql += " WHERE research_state_id = %s"
        params.append(research_state_id)
    sql += " ORDER BY prediction_date DESC LIMIT 1"
    cur.execute(sql, params)
    return cur.fetchone()


def _staleness_status(state_date: date | None) -> tuple[str, int | None]:
    lag = _days_since(state_date)
    if lag is None:
        return "stale", None
    if lag <= 8:
        return "fresh", lag
    if lag <= 14:
        return "aging", lag
    return "stale", lag


def compute_deterministic_decision(state_row: dict[str, Any], latest_forecast: dict[str, Any] | None = None) -> dict[str, Any]:
    parse_status = state_row.get("parse_status") or "failed"
    freshness = float(state_row.get("signal_freshness_score") or 0.0)
    coherence = float(state_row.get("signal_coherence_index") or 0.0)
    shock_type = state_row.get("shock_type") or "mixed"
    analog_significance = _json_loads(state_row.get("analog_significance_json"), {})
    adversarial_risk = float(
        (latest_forecast or {}).get("adversarial_risk")
        or state_row.get("adversarial_risk")
        or 0.0
    )
    agent_agreement = float((latest_forecast or {}).get("agent_agreement_score") or 0.5)
    forecast_confidence = float((latest_forecast or {}).get("forecast_confidence") or 0.0)
    dispersion = float((latest_forecast or {}).get("scenario_dispersion_score") or 0.0)
    staleness_status, lag_days = _staleness_status(state_row.get("state_date"))
    reasons: list[str] = []

    if coherence < 0.40:
        reasons.append(f"coherence below 0.40 ({coherence:.2f})")
    if freshness < 0.35:
        reasons.append(f"freshness below 0.35 ({freshness:.2f})")
    if parse_status != "complete":
        reasons.append(f"parse status {parse_status}")
    if shock_type == "exogenous":
        reasons.append("exogenous shock active")
    if adversarial_risk > 0.75:
        reasons.append(f"adversarial risk elevated ({adversarial_risk:.2f})")
    if staleness_status == "aging":
        reasons.append(f"state aging: {lag_days} days since brief")
    elif staleness_status == "stale":
        reasons.append(f"state stale: {lag_days} days since brief")
    if not analog_significance.get("is_significant"):
        reasons.append("analog significance below threshold")
    if agent_agreement < 0.45 and latest_forecast is not None:
        reasons.append(f"agent agreement weak ({agent_agreement:.2f})")

    if (
        coherence < 0.40
        or freshness < 0.35
        or staleness_status == "stale"
        or adversarial_risk > 0.75
        or (not analog_significance.get("is_significant") and agent_agreement < 0.45)
    ):
        posture = "abstain"
    elif (
        parse_status != "complete"
        or freshness < 0.50
        or coherence < 0.55
        or shock_type == "exogenous"
        or staleness_status != "fresh"
    ):
        posture = "paper_only"
    elif forecast_confidence < 0.65 or dispersion > 0.70 or adversarial_risk > 0.55:
        posture = "reduced_size"
    else:
        posture = "normal_conviction"

    size_multiplier = {
        "abstain": 0.0,
        "paper_only": 0.25,
        "reduced_size": 0.5,
        "normal_conviction": 1.0,
    }[posture]
    if posture == "normal_conviction" and not reasons:
        reasons.append("signals, parse quality, and regime posture aligned")

    return {
        "action_posture": posture,
        "action_posture_reasons": reasons,
        "size_multiplier": size_multiplier,
        "analog_influence_enabled": bool(analog_significance.get("is_significant")),
        "state_staleness_status": staleness_status,
        "effective_scope_chain": _scope_chain(state_row),
    }


def get_latest_state(*, scope_type: str = "market", scope_key: str = "global", ensure_sync: bool = True) -> dict[str, Any] | None:
    if ensure_sync and scope_type == "market" and scope_key == "global":
        ensure_market_state_synced()
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM public.research_state
            WHERE scope_type = %s AND scope_key = %s
            ORDER BY state_date DESC, updated_at DESC
            LIMIT 1
            """,
            (scope_type, scope_key),
        )
        row = cur.fetchone()
        if not row:
            return None
        provenance = _load_provenance(cur, str(row["id"]))
        latest_forecast = _load_latest_forecast(cur, str(row["id"]))
        deterministic_decision = compute_deterministic_decision(row, latest_forecast)
        return {
            **row,
            "field_provenance": provenance,
            "parse_quality": {
                "parse_status": row.get("parse_status"),
                "parse_confidence": float(row.get("parse_confidence") or 0),
                "parse_warnings": _json_loads(row.get("parse_warnings_json"), []),
                "missing_fields": _json_loads(row.get("missing_fields_json"), []),
            },
            "confidence_delta": _json_loads(row.get("confidence_delta_json"), {}),
            "deterministic_decision": deterministic_decision,
            "latest_forecast": latest_forecast,
        }


def list_state_history(*, scope_type: str = "market", scope_key: str = "global", ensure_sync: bool = True) -> list[dict[str, Any]]:
    if ensure_sync and scope_type == "market" and scope_key == "global":
        ensure_market_state_synced()
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM public.research_state
            WHERE scope_type = %s AND scope_key = %s
            ORDER BY state_date DESC, updated_at DESC
            """,
            (scope_type, scope_key),
        )
        rows = cur.fetchall()
    return rows
