"""History Rhymes Morning Book v1 — deterministic regime-transition delta.

Pure (no DB, no LLM, no network). Computes the delta between the two most
recent research briefs and answers exactly one question: "What materially
changed since the last regime assessment, and should I care?"

Contract (locked by plan review):
  - Observational, not interpretive. `current_regime` is the RAW
    `parsed_json.regime_call` string — no enum normalization, no registry, no
    ontology. Raw transitions are surfaced honestly.
  - `what_changed` bullets are emitted in a FROZEN order; callers/renderers must
    not reorder or sort. Never an empty list — an explicit no-change marker is
    returned instead.
  - Triage clamps to "Research Only" whenever the latest brief is degraded or
    there is no previous brief. This clamp is a non-negotiable guardrail: never
    escalate urgency on parser-flagged-degraded or insufficient data.
  - Fail closed: missing/malformed fields become null + a warning. Nothing is
    ever fabricated.

Usage:
    from app.services.hr_morning_book import compute_morning_book
    result = compute_morning_book(
        latest_brief=..., previous_brief=...,
        latest_candidates=[...], previous_candidates=[...],
        today=date.today(),
    )
    result.to_dict()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)

# Triage tiers.
ACT_NOW = "Act Now"
WATCH = "Watch"
RESEARCH_ONLY = "Research Only"

# Confidence-movement thresholds (binary-ish; display + triage only).
CONF_MATERIAL = 0.10   # |delta| >= this => a what_changed bullet + status flip
CONF_WATCH = 0.05      # drop in [CONF_WATCH, CONF_ACT) => Watch
CONF_ACT = 0.15        # drop >= this => Act Now

# Freshness buckets, in days, of the latest brief vs today.
FRESH_MAX_DAYS = 8     # weekly cadence + 1d grace
STALE_MAX_DAYS = 15

HIGH_SEVERITY_VERDICTS = {"FAIL", "CAUTION", "HOLD", "ABSTAIN"}  # top_risks pool
NEW_RISK_VERDICTS = {"FAIL", "CAUTION", "HOLD"}   # tracked as new-risk signals
RISK_BULLET_VERDICTS = {"FAIL", "CAUTION"}        # surface as a "New risk" bullet
ACT_NOW_RISK_VERDICTS = {"FAIL"}                  # escalate triage to Act Now
WATCH_RISK_VERDICTS = {"CAUTION", "HOLD"}         # escalate triage to Watch
PRIORITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
TOP_CAP = 3

NO_CHANGE_MARKER = (
    "No material regime, confidence, risk, or enhancement changes vs previous brief."
)
INITIALIZATION_WARNING = "Morning Book operating in initialization mode."


@dataclass
class MorningBookResult:
    current_regime: str | None
    what_changed: list[str]
    confidence: dict[str, Any]
    freshness: dict[str, Any]
    top_risks: list[str]
    top_new_enhancements: list[str]
    triage: str
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "current_regime": self.current_regime,
            "what_changed": list(self.what_changed),
            "confidence": dict(self.confidence),
            "freshness": dict(self.freshness),
            "top_risks": list(self.top_risks),
            "top_new_enhancements": list(self.top_new_enhancements),
            "triage": self.triage,
            "warnings": list(self.warnings),
        }


# Safe shape for the 0-brief case (analog to hr_decision_runner.NO_INPUT_RESPONSE).
INSUFFICIENT_DATA_RESULT: dict[str, Any] = {
    "current_regime": None,
    "what_changed": [
        "No research briefs found; ingest a 7-section brief to populate the Morning Book."
    ],
    "confidence": {"current": None, "previous": None, "delta": None, "status": "unknown"},
    "freshness": {
        "latest_brief_date": None,
        "previous_brief_date": None,
        "status": "unknown",
    },
    "top_risks": [],
    "top_new_enhancements": [],
    "triage": RESEARCH_ONLY,
    "warnings": ["No research briefs found.", INITIALIZATION_WARNING],
}


# ── Public API ────────────────────────────────────────────────────────────────


def compute_morning_book(
    *,
    latest_brief: dict[str, Any] | None,
    previous_brief: dict[str, Any] | None,
    latest_candidates: list[dict[str, Any]] | None = None,
    previous_candidates: list[dict[str, Any]] | None = None,
    today: date,
) -> MorningBookResult:
    """Compute the latest-vs-previous regime-transition delta. Never raises."""
    latest_candidates = latest_candidates or []
    previous_candidates = previous_candidates or []
    warnings: list[str] = []

    if latest_brief is None:
        return MorningBookResult(**INSUFFICIENT_DATA_RESULT)

    latest_parsed = _parsed(latest_brief)
    prev_parsed = _parsed(previous_brief) if previous_brief is not None else {}

    current_regime = latest_parsed.get("regime_call")  # RAW — never normalized
    if current_regime is None:
        warnings.append("Latest brief has no regime_call; current regime unknown.")

    latest_degraded = bool(latest_parsed.get("degraded"))
    if latest_degraded:
        warnings.append(
            "Latest brief extracted as degraded; delta uses parseable fields "
            "only, not narrative interpretation."
        )
    if previous_brief is not None and bool(prev_parsed.get("degraded")):
        warnings.append(
            "Previous brief extracted as degraded; deltas may understate change."
        )

    confidence = _confidence_block(latest_brief, previous_brief)
    freshness = _freshness_block(latest_brief, previous_brief, today)

    top_risks = _top_risks(latest_candidates)
    new_risks = _new_risks(latest_candidates, previous_candidates)
    new_risk_bullet_titles = [
        t for (t, v) in new_risks if v in RISK_BULLET_VERDICTS
    ]
    has_act_now_risk = any(v in ACT_NOW_RISK_VERDICTS for (_, v) in new_risks)
    has_watch_risk = any(v in WATCH_RISK_VERDICTS for (_, v) in new_risks)
    new_enhancements = _new_enhancement_titles(latest_candidates, previous_candidates)
    top_new_enhancements = new_enhancements[:TOP_CAP]

    has_previous = previous_brief is not None

    if not has_previous:
        warnings.append(
            "Only one brief available; cannot compute a delta until a second "
            "brief is ingested."
        )
        warnings.append(INITIALIZATION_WARNING)
        what_changed = [
            "No previous brief to diff against; this is the first ingested brief."
        ]
    else:
        what_changed = _what_changed(
            latest_parsed=latest_parsed,
            prev_parsed=prev_parsed,
            confidence=confidence,
            freshness=freshness,
            new_risk_bullet_titles=new_risk_bullet_titles,
            new_enhancements=new_enhancements,
        )

    triage = _triage(
        has_previous=has_previous,
        latest_degraded=latest_degraded,
        regime_changed=_regime_changed(latest_parsed, prev_parsed) if has_previous else False,
        confidence=confidence,
        has_act_now_risk=has_act_now_risk,
        has_watch_risk=has_watch_risk,
        new_enhancement_priorities=_priorities(new_enhancements, latest_candidates),
        freshness=freshness,
    )

    return MorningBookResult(
        current_regime=current_regime,
        what_changed=what_changed,
        confidence=confidence,
        freshness=freshness,
        top_risks=top_risks,
        top_new_enhancements=top_new_enhancements,
        triage=triage,
        warnings=warnings,
    )


# ── Internals ─────────────────────────────────────────────────────────────────


def _parsed(brief: dict[str, Any] | None) -> dict[str, Any]:
    if not brief:
        return {}
    pj = brief.get("parsed_json")
    return pj if isinstance(pj, dict) else {}


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _confidence_block(
    latest: dict[str, Any], previous: dict[str, Any] | None
) -> dict[str, Any]:
    cur = _to_float(latest.get("confidence"))
    prev = _to_float(previous.get("confidence")) if previous else None
    delta = round(cur - prev, 4) if (cur is not None and prev is not None) else None
    if delta is None:
        status = "unknown"
    elif delta <= -CONF_MATERIAL:
        status = "deteriorating"
    elif delta >= CONF_MATERIAL:
        status = "improving"
    else:
        status = "stable"
    return {"current": cur, "previous": prev, "delta": delta, "status": status}


def _freshness_block(
    latest: dict[str, Any], previous: dict[str, Any] | None, today: date
) -> dict[str, Any]:
    latest_date = _as_date(latest.get("brief_date"))
    prev_date = _as_date(previous.get("brief_date")) if previous else None
    if latest_date is None:
        status = "unknown"
    else:
        age = (today - latest_date).days
        if age <= FRESH_MAX_DAYS:
            status = "fresh"
        elif age <= STALE_MAX_DAYS:
            status = "stale"
        else:
            status = "very_stale"
    return {
        "latest_brief_date": latest_date.isoformat() if latest_date else None,
        "previous_brief_date": prev_date.isoformat() if prev_date else None,
        "status": status,
    }


_FRESHNESS_RANK = {"fresh": 0, "stale": 1, "very_stale": 2, "unknown": 3}


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _normalize_title(title: Any) -> str:
    return " ".join(str(title or "").split()).lower()


def _candidate_titles(candidates: list[dict[str, Any]]) -> set[str]:
    return {_normalize_title(c.get("title")) for c in candidates if c.get("title")}


def _sorted_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Priority asc (critical first) then created_at desc."""
    return sorted(
        candidates,
        key=lambda c: (
            PRIORITY_RANK.get(str(c.get("priority") or "medium").lower(), 2),
            _neg_created(c.get("created_at")),
        ),
    )


def _neg_created(value: Any) -> str:
    # created_at is an ISO string or datetime; sort desc by negating via reverse key.
    s = value.isoformat() if hasattr(value, "isoformat") else str(value or "")
    # Invert lexical order so larger timestamps sort first within a priority tier.
    return "".join(chr(255 - ord(ch)) if ord(ch) < 255 else ch for ch in s)


def _top_risks(latest_candidates: list[dict[str, Any]]) -> list[str]:
    risks = [
        c
        for c in latest_candidates
        if str(c.get("adversarial_verdict") or "").upper() in HIGH_SEVERITY_VERDICTS
    ]
    return [str(c.get("title")) for c in _sorted_candidates(risks)[:TOP_CAP]]


def _new_risks(
    latest_candidates: list[dict[str, Any]], previous_candidates: list[dict[str, Any]]
) -> list[tuple[str, str]]:
    """New (title, verdict-upper) risk pairs not present in the previous brief."""
    prev = _candidate_titles(previous_candidates)
    out: list[tuple[str, str]] = []
    for c in _sorted_candidates(latest_candidates):
        verdict = str(c.get("adversarial_verdict") or "").upper()
        title = c.get("title")
        if verdict in NEW_RISK_VERDICTS and _normalize_title(title) not in prev:
            out.append((str(title), verdict))
    return out


def _new_enhancement_titles(
    latest_candidates: list[dict[str, Any]], previous_candidates: list[dict[str, Any]]
) -> list[str]:
    prev = _candidate_titles(previous_candidates)
    out: list[str] = []
    for c in _sorted_candidates(latest_candidates):
        title = c.get("title")
        if _normalize_title(title) not in prev:
            out.append(str(title))
    return out


def _priorities(
    titles: list[str], candidates: list[dict[str, Any]]
) -> list[str]:
    by_title = {_normalize_title(c.get("title")): c for c in candidates}
    return [
        str(by_title.get(_normalize_title(t), {}).get("priority") or "medium").lower()
        for t in titles
    ]


def _regime_changed(latest: dict[str, Any], prev: dict[str, Any]) -> bool:
    lc, pc = latest.get("regime_call"), prev.get("regime_call")
    return lc is not None and pc is not None and lc != pc


def _what_changed(
    *,
    latest_parsed: dict[str, Any],
    prev_parsed: dict[str, Any],
    confidence: dict[str, Any],
    freshness: dict[str, Any],
    new_risk_bullet_titles: list[str],
    new_enhancements: list[str],
) -> list[str]:
    """Bullets in FROZEN order. Renderers must not reorder/sort."""
    bullets: list[str] = []

    # 1. Regime shift
    if _regime_changed(latest_parsed, prev_parsed):
        bullets.append(
            f"Regime call shifted: {prev_parsed['regime_call']} "
            f"→ {latest_parsed['regime_call']}"
        )

    # 2. Confidence movement
    delta = confidence.get("delta")
    if delta is not None and abs(delta) >= CONF_MATERIAL:
        cur, prev = confidence["current"], confidence["previous"]
        direction = "decreased" if delta < 0 else "increased"
        bullets.append(f"Confidence {direction} from {prev} to {cur}")

    # 3. Freshness deterioration (latest worse than the previous brief's bucket)
    prev_fresh_status = _bucket_for_prev(prev_parsed, freshness)
    if (
        prev_fresh_status is not None
        and _FRESHNESS_RANK.get(freshness["status"], 3)
        > _FRESHNESS_RANK.get(prev_fresh_status, 3)
    ):
        bullets.append(
            f"Brief freshness deteriorated: {prev_fresh_status} → {freshness['status']}"
        )

    # 4. Degraded flip
    latest_deg = bool(latest_parsed.get("degraded"))
    prev_deg = bool(prev_parsed.get("degraded"))
    if latest_deg != prev_deg:
        bullets.append(
            "Brief extraction quality "
            + ("degraded" if latest_deg else "recovered")
        )

    # 5. New risks (FAIL/CAUTION verdicts only)
    bullets.extend(f"New risk: {t}" for t in new_risk_bullet_titles)

    # 6. New enhancements
    bullets.extend(f"New enhancement: {t}" for t in new_enhancements)

    return bullets or [NO_CHANGE_MARKER]


def _bucket_for_prev(
    prev_parsed: dict[str, Any], freshness: dict[str, Any]
) -> str | None:
    """Previous brief's freshness bucket relative to the latest brief's date.

    Freshness deterioration is only meaningful when both dates exist; the
    previous brief's age is measured vs the latest brief's date (not today),
    so the comparison reflects cadence drift between the two briefs.
    """
    prev_date = _as_date(freshness.get("previous_brief_date"))
    latest_date = _as_date(freshness.get("latest_brief_date"))
    if prev_date is None or latest_date is None:
        return None
    # The previous brief was, by definition, "fresh" at its own time; what we
    # detect here is whether the gap to the latest brief exceeds cadence.
    gap = (latest_date - prev_date).days
    if gap <= FRESH_MAX_DAYS:
        return "fresh"
    if gap <= STALE_MAX_DAYS:
        return "stale"
    return "very_stale"


def _triage(
    *,
    has_previous: bool,
    latest_degraded: bool,
    regime_changed: bool,
    confidence: dict[str, Any],
    has_act_now_risk: bool,
    has_watch_risk: bool,
    new_enhancement_priorities: list[str],
    freshness: dict[str, Any],
) -> str:
    # Non-negotiable clamp: never escalate on degraded / insufficient data.
    if latest_degraded or not has_previous:
        return RESEARCH_ONLY

    delta = confidence.get("delta")

    if regime_changed or (delta is not None and delta <= -CONF_ACT) or has_act_now_risk:
        return ACT_NOW

    watch = (
        (delta is not None and -CONF_ACT < delta <= -CONF_WATCH)
        or has_watch_risk
        or any(p in ("high", "critical") for p in new_enhancement_priorities)
        or freshness.get("status") in ("stale", "very_stale")
    )
    return WATCH if watch else RESEARCH_ONLY
