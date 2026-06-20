"""Deterministic event-question parsing and calibrated analog probabilities."""

from __future__ import annotations

import calendar
import math
import re
from datetime import date, datetime, timezone
from statistics import NormalDist
from typing import Any, Literal

from pydantic import BaseModel, Field

PARSER_VERSION = "hr-polymarket-parser-v1"
MODEL_VERSION = "hr-analog-beta-v1"

MappingStatus = Literal["eligible", "unsupported", "ambiguous"]
ForecastStatus = Literal[
    "research",
    "withheld",
    "unsupported",
    "ambiguous",
    "stale",
    "uncalibrated",
]


class ParsedForecastQuestion(BaseModel):
    question: str
    family: str | None = None
    subject: str | None = None
    predicate: str | None = None
    threshold: float | None = None
    target_date: date | None = None
    timezone: str | None = None
    resolution_source: str | None = None
    mapping_status: MappingStatus
    mapping_reason: str | None = None
    parser_version: str = PARSER_VERSION
    parsed_json: dict[str, Any] = Field(default_factory=dict)


class AnalogObservation(BaseModel):
    analog_id: str
    anchor_date: date
    outcome_date: date
    rhyme_score: float
    observed_value: float | bool
    source: str
    lineage: dict[str, Any] = Field(default_factory=dict)


class CalibrationEvidence(BaseModel):
    observations: int
    brier_score: float
    climatology_brier: float
    expected_calibration_error: float
    live_resolutions: int = 0
    live_window_days: int = 0
    live_brier_score: float | None = None

    @property
    def offline_passes(self) -> bool:
        return (
            self.observations >= 50
            and self.brier_score <= self.climatology_brier - 0.01
            and self.expected_calibration_error <= 0.10
        )

    @property
    def live_passes(self) -> bool:
        return (
            self.live_resolutions >= 30
            and self.live_window_days >= 90
            and self.live_brier_score is not None
            and self.live_brier_score < 0.22
        )


class EventForecast(BaseModel):
    forecast_at: datetime
    p_polymarket: float | None
    p_hr: float | None = None
    posterior_lower: float | None = None
    posterior_upper: float | None = None
    signed_divergence: float | None = None
    p_base: float | None = None
    analog_count: int = 0
    effective_sample_size: float = 0.0
    analog_sample: list[dict[str, Any]] = Field(default_factory=list)
    calibration: dict[str, Any] = Field(default_factory=dict)
    forecast_status: ForecastStatus
    null_reason: str | None = None
    model_version: str = MODEL_VERSION
    data_lineage: dict[str, Any] = Field(default_factory=dict)
    research_only: bool = True
    eligible_position_sizing: bool = False


class WalkForwardObservation(BaseModel):
    forecast_at: datetime
    probability: float
    outcome: float


def parse_forecast_question(
    question: str,
    *,
    resolution_source: str | None,
) -> ParsedForecastQuestion:
    text = " ".join(question.strip().split())
    lowered = text.lower()
    target_date = _extract_date(lowered)
    predicate, threshold = _extract_predicate_threshold(lowered)

    family: str | None = None
    subject: str | None = None
    timezone_name: str | None = None

    asset = _extract_asset(lowered)
    if asset:
        family = "asset_close"
        subject = asset
        timezone_name = "America/New_York" if asset == "SPY" else "UTC"
    elif "consumer price index" in lowered or re.search(r"\bcpi\b", lowered):
        family = "cpi_yoy"
        subject = "CPIAUCSL_YOY"
        timezone_name = "America/New_York"
    elif "unemployment" in lowered or "jobless rate" in lowered:
        family = "unemployment"
        subject = "UNRATE"
        timezone_name = "America/New_York"
    elif "recession" in lowered and (
        "united states" in lowered or re.search(r"\bu\.?s\.?\b", lowered)
    ):
        family = "us_recession"
        subject = "USREC"
        predicate = "equals"
        threshold = 1.0
        timezone_name = "America/New_York"
    elif ("fed" in lowered or "federal reserve" in lowered) and (
        "cut" in lowered or "cuts" in lowered
    ):
        family = "fed_cuts"
        subject = "DFEDTARU_CUT_COUNT"
        timezone_name = "America/New_York"
        if threshold is None:
            threshold = _extract_cut_count(lowered)
        if predicate is None and threshold is not None:
            predicate = "at_least"
    elif (
        "fed" in lowered
        or "federal reserve" in lowered
        or "federal funds" in lowered
    ) and ("upper bound" in lowered or "target rate" in lowered):
        family = "fed_upper_bound"
        subject = "DFEDTARU"
        timezone_name = "America/New_York"

    if family is None:
        return ParsedForecastQuestion(
            question=text,
            resolution_source=resolution_source,
            mapping_status="unsupported",
            mapping_reason="unsupported_question_family",
        )

    missing = []
    if target_date is None:
        missing.append("target_date")
    if predicate is None:
        missing.append("predicate")
    if threshold is None:
        missing.append("threshold")
    if not resolution_source:
        missing.append("resolution_source")
    if family == "asset_close" and "close" not in lowered:
        missing.append("close_basis")
    if family in {"cpi_yoy", "unemployment"} and not (
        "year-over-year" in lowered
        or "year over year" in lowered
        or "yoy" in lowered
        or family == "unemployment"
    ):
        missing.append("measurement_basis")

    status: MappingStatus = "ambiguous" if missing else "eligible"
    reason = f"missing_or_ambiguous:{','.join(missing)}" if missing else None
    return ParsedForecastQuestion(
        question=text,
        family=family,
        subject=subject,
        predicate=predicate,
        threshold=threshold,
        target_date=target_date,
        timezone=timezone_name,
        resolution_source=resolution_source,
        mapping_status=status,
        mapping_reason=reason,
        parsed_json={
            "normalized_question": lowered,
            "family": family,
            "subject": subject,
            "predicate": predicate,
            "threshold": threshold,
            "target_date": target_date.isoformat() if target_date else None,
            "timezone": timezone_name,
        },
    )


def build_event_forecast(
    question: ParsedForecastQuestion,
    *,
    forecast_at: datetime,
    p_polymarket: float | None,
    p_base: float,
    analogs: list[AnalogObservation],
    calibration: CalibrationEvidence | None,
    inputs_stale: bool = False,
) -> EventForecast:
    as_of = forecast_at.astimezone(timezone.utc)
    if question.mapping_status != "eligible":
        return _withheld(
            as_of,
            p_polymarket,
            status=question.mapping_status,
            reason=question.mapping_reason or f"question_{question.mapping_status}",
        )
    if inputs_stale or p_polymarket is None:
        return _withheld(
            as_of,
            p_polymarket,
            status="stale",
            reason="forecast_inputs_stale",
        )
    if calibration is None or not calibration.offline_passes:
        return _withheld(
            as_of,
            p_polymarket,
            status="uncalibrated",
            reason="event_family_failed_offline_calibration_gate",
            calibration=calibration,
        )

    valid = [
        analog
        for analog in analogs
        if analog.anchor_date < analog.outcome_date < as_of.date()
        and analog.rhyme_score > 0
    ]
    valid.sort(key=lambda item: item.rhyme_score, reverse=True)
    selected = valid[:20]
    if len(selected) < 20:
        return _withheld(
            as_of,
            p_polymarket,
            status="withheld",
            reason="fewer_than_20_no_lookahead_analog_outcomes",
            calibration=calibration,
            analog_count=len(selected),
        )

    raw_weight = sum(item.rhyme_score for item in selected)
    if raw_weight <= 0:
        return _withheld(
            as_of,
            p_polymarket,
            status="withheld",
            reason="analog_weights_invalid",
            calibration=calibration,
        )
    weights = [item.rhyme_score / raw_weight * 20.0 for item in selected]
    outcomes = [
        1.0 if evaluate_predicate(question, item.observed_value) else 0.0
        for item in selected
    ]
    weighted_successes = sum(
        weight * outcome for weight, outcome in zip(weights, outcomes, strict=True)
    )
    p_hr = (10.0 * p_base + weighted_successes) / (10.0 + sum(weights))
    alpha = 10.0 * p_base + weighted_successes
    beta = 10.0 * (1.0 - p_base) + sum(
        weight * (1.0 - outcome)
        for weight, outcome in zip(weights, outcomes, strict=True)
    )
    lower, upper = _beta_normal_interval(alpha, beta)
    research_only = not calibration.live_passes

    sample = []
    for item, weight, outcome in zip(selected, weights, outcomes, strict=True):
        sample.append(
            {
                "analog_id": item.analog_id,
                "anchor_date": item.anchor_date.isoformat(),
                "outcome_date": item.outcome_date.isoformat(),
                "rhyme_score": item.rhyme_score,
                "normalized_weight": weight,
                "observed_value": item.observed_value,
                "predicate_outcome": outcome,
                "source": item.source,
                "lineage": item.lineage,
            }
        )

    return EventForecast(
        forecast_at=as_of,
        p_polymarket=_probability(p_polymarket),
        p_hr=_probability(p_hr),
        posterior_lower=lower,
        posterior_upper=upper,
        signed_divergence=p_polymarket - p_hr,
        p_base=_probability(p_base),
        analog_count=len(selected),
        effective_sample_size=sum(weights),
        analog_sample=sample,
        calibration=calibration.model_dump(),
        forecast_status="research",
        model_version=MODEL_VERSION,
        data_lineage={
            "parser_version": question.parser_version,
            "no_lookahead_cutoff": as_of.date().isoformat(),
            "analog_weight_sum": sum(weights),
            "prior_strength": 10,
            "formula": "(10*p_base + sum(w_i*y_i)) / (10 + sum(w_i))",
        },
        research_only=research_only,
        eligible_position_sizing=not research_only,
    )


def evaluate_predicate(
    question: ParsedForecastQuestion, observed_value: float | bool
) -> bool:
    if question.threshold is None or question.predicate is None:
        raise ValueError("eligible question requires predicate and threshold")
    value = float(observed_value)
    threshold = question.threshold
    if question.predicate == "above":
        return value > threshold
    if question.predicate == "below":
        return value < threshold
    if question.predicate == "at_least":
        return value >= threshold
    if question.predicate == "at_most":
        return value <= threshold
    if question.predicate == "equals":
        return value == threshold
    raise ValueError(f"unsupported predicate: {question.predicate}")


def calibration_from_walk_forward(
    observations: list[WalkForwardObservation],
    *,
    bins: int = 10,
    live_resolutions: int = 0,
    live_window_days: int = 0,
    live_brier_score: float | None = None,
) -> CalibrationEvidence:
    """Compute launch-gate metrics from time-ordered walk-forward receipts."""
    ordered = sorted(observations, key=lambda item: item.forecast_at)
    if not ordered:
        return CalibrationEvidence(
            observations=0,
            brier_score=1.0,
            climatology_brier=1.0,
            expected_calibration_error=1.0,
            live_resolutions=live_resolutions,
            live_window_days=live_window_days,
            live_brier_score=live_brier_score,
        )
    outcomes = [float(item.outcome) for item in ordered]
    probabilities = [_probability(item.probability) for item in ordered]
    climatology = sum(outcomes) / len(outcomes)
    brier = sum(
        (probability - outcome) ** 2
        for probability, outcome in zip(probabilities, outcomes, strict=True)
    ) / len(outcomes)
    climatology_brier = sum(
        (climatology - outcome) ** 2 for outcome in outcomes
    ) / len(outcomes)
    ece = _expected_calibration_error(probabilities, outcomes, bins=bins)
    return CalibrationEvidence(
        observations=len(ordered),
        brier_score=brier,
        climatology_brier=climatology_brier,
        expected_calibration_error=ece,
        live_resolutions=live_resolutions,
        live_window_days=live_window_days,
        live_brier_score=live_brier_score,
    )


def _withheld(
    forecast_at: datetime,
    p_polymarket: float | None,
    *,
    status: ForecastStatus,
    reason: str,
    calibration: CalibrationEvidence | None = None,
    analog_count: int = 0,
) -> EventForecast:
    return EventForecast(
        forecast_at=forecast_at,
        p_polymarket=(
            _probability(p_polymarket) if p_polymarket is not None else None
        ),
        forecast_status=status,
        null_reason=reason,
        analog_count=analog_count,
        calibration=calibration.model_dump() if calibration else {},
        research_only=True,
        eligible_position_sizing=False,
    )


def _extract_asset(text: str) -> str | None:
    aliases = {
        "spy": "SPY",
        "s&p 500 etf": "SPY",
        "bitcoin": "BTC",
        "btc": "BTC",
        "ethereum": "ETH",
        "ether": "ETH",
        "eth": "ETH",
    }
    for alias, symbol in aliases.items():
        if re.search(rf"\b{re.escape(alias)}\b", text):
            return symbol
    return None


def _extract_predicate_threshold(text: str) -> tuple[str | None, float | None]:
    patterns = [
        ("at_least", r"(?:at least|no fewer than)\s+\$?([\d,]+(?:\.\d+)?)"),
        ("at_most", r"(?:at most|no more than)\s+\$?([\d,]+(?:\.\d+)?)"),
        ("above", r"(?:above|over|greater than)\s+\$?([\d,]+(?:\.\d+)?)"),
        ("below", r"(?:below|under|less than)\s+\$?([\d,]+(?:\.\d+)?)"),
    ]
    for predicate, pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return predicate, float(match.group(1).replace(",", ""))
    reverse = re.search(
        r"\b([\d,]+(?:\.\d+)?)\s+(?:or more|or higher|or above)\b", text
    )
    if reverse:
        return "at_least", float(reverse.group(1).replace(",", ""))
    reverse = re.search(
        r"\b([\d,]+(?:\.\d+)?)\s+(?:or fewer|or lower|or below)\b", text
    )
    if reverse:
        return "at_most", float(reverse.group(1).replace(",", ""))
    return None, None


def _extract_cut_count(text: str) -> float | None:
    match = re.search(r"\b(\d+)\s+(?:rate\s+)?cuts?\b", text)
    return float(match.group(1)) if match else None


def _extract_date(text: str) -> date | None:
    iso = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", text)
    if iso:
        try:
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        except ValueError:
            return None

    month_pattern = (
        r"(january|february|march|april|may|june|july|august|"
        r"september|october|november|december)"
    )
    full = re.search(
        rf"\b{month_pattern}\s+(\d{{1,2}})(?:st|nd|rd|th)?[,]?\s+(20\d{{2}})\b",
        text,
    )
    if full:
        month = _month_number(full.group(1))
        try:
            return date(int(full.group(3)), month, int(full.group(2)))
        except ValueError:
            return None

    month_year = re.search(rf"\b{month_pattern}\s+(20\d{{2}})\b", text)
    if month_year and (
        "by " in text
        or "end of" in text
        or "through " in text
        or "before " in text
    ):
        month = _month_number(month_year.group(1))
        year = int(month_year.group(2))
        return date(year, month, calendar.monthrange(year, month)[1])

    year_end = re.search(r"(?:end of|by)\s+(20\d{2})\b", text)
    if year_end:
        return date(int(year_end.group(1)), 12, 31)
    return None


def _month_number(name: str) -> int:
    return {
        month.lower(): index
        for index, month in enumerate(calendar.month_name)
        if month
    }[name.lower()]


def _beta_normal_interval(alpha: float, beta: float) -> tuple[float, float]:
    total = alpha + beta
    mean = alpha / total
    variance = alpha * beta / (total * total * (total + 1.0))
    z = NormalDist().inv_cdf(0.975)
    margin = z * math.sqrt(max(variance, 0.0))
    return _probability(mean - margin), _probability(mean + margin)


def _probability(value: float) -> float:
    return min(max(float(value), 0.0), 1.0)


def _expected_calibration_error(
    probabilities: list[float],
    outcomes: list[float],
    *,
    bins: int,
) -> float:
    total = len(probabilities)
    bins = max(bins, 1)
    error = 0.0
    for index in range(bins):
        lower = index / bins
        upper = (index + 1) / bins
        members = [
            position
            for position, probability in enumerate(probabilities)
            if lower <= probability < upper
            or (index == bins - 1 and probability == 1.0)
        ]
        if not members:
            continue
        confidence = sum(probabilities[position] for position in members) / len(
            members
        )
        accuracy = sum(outcomes[position] for position in members) / len(members)
        error += len(members) / total * abs(confidence - accuracy)
    return error
