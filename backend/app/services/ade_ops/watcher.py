"""Post-change watcher for ADE Ops (PR 6A) — evaluate, never act.

After a change executes (simulated PR 5B or a real non-prod Snowflake auto_suspend
PR 5C), the watcher evaluates it during its observation window and produces a
verdict: accepted / still_observing / degraded / rollback_recommended /
insufficient_evidence. It reads receipts and compares expected-vs-observed
evidence; it **does not roll back, does not write to any provider, and recommends
only**. A `rollback_recommended` verdict is an artifact — closing the loop with a
human, not an automatic action (auto-rollback is a later, explicit decision).

The central honesty rule: missing observation evidence returns
`insufficient_evidence`, never `accepted`. Absence of signal is not success.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from enum import StrEnum

from pydantic import BaseModel, Field

from app.services.ade_ops.approvals import ApprovalRequest


class WatcherVerdict(StrEnum):
    ACCEPTED = "accepted"
    STILL_OBSERVING = "still_observing"
    DEGRADED = "degraded"
    ROLLBACK_RECOMMENDED = "rollback_recommended"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class Observation(BaseModel):
    """Observed evidence during the window. Supplied by the caller (telemetry /
    provider read where available). When absent/missing, the watcher fails to
    insufficient_evidence rather than guessing success."""

    evidence_status: str = "missing"   # ok | failed | stale | missing
    metric: str | None = None
    expected: float | None = None
    observed: float | None = None
    lower_is_better: bool = True       # cost / auto_suspend latency: lower is better
    tolerance: float = 0.10            # within ±10% counts as stable
    source: str | None = None


class WatcherResult(BaseModel):
    approval_id: str | None = None
    execution_mode: str | None = None  # simulation | nonprod (distinguished in UI)
    verdict: WatcherVerdict
    finding: str | None = None
    recommendation: str | None = None  # artifact only — never executed
    evidence: list[dict] = Field(default_factory=list)
    null_reason: str | None = None
    window_open: bool | None = None
    rollback_required: bool = False    # mirrors the receipt; still not executed here

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


_WINDOW = re.compile(r"^\s*(\d+)\s*[- ]?\s*(day|days|d|hour|hours|h|minute|minutes|m)\b", re.IGNORECASE)
_UNIT_SECONDS = {"d": 86400, "day": 86400, "days": 86400,
                 "h": 3600, "hour": 3600, "hours": 3600,
                 "m": 60, "minute": 60, "minutes": 60}
DEFAULT_WINDOW_SECONDS = 14 * 86400


def parse_window_seconds(window: str | None) -> int:
    """Parse '14-day' / '3d' / '6 hours'. Falls back to the 14-day default when a
    duration can't be read (e.g. 'next 3 refresh cycles')."""
    if not window:
        return DEFAULT_WINDOW_SECONDS
    m = _WINDOW.match(window)
    if not m:
        return DEFAULT_WINDOW_SECONDS
    n, unit = int(m.group(1)), m.group(2).lower()
    return n * _UNIT_SECONDS.get(unit, 86400)


def _ev(label: str, value, source: str) -> dict:
    return {"label": label, "value": value, "source": source}


def evaluate(req: ApprovalRequest, *, observation: Observation | None, now: datetime) -> WatcherResult:
    """Produce a watcher verdict for an executed change. Reads only; recommends only."""
    base = {"approval_id": req.approval_id, "execution_mode": req.execution_mode,
            "rollback_required": req.rolled_back is False and bool(req.rollback_plan)}

    # Only an executed change is watchable.
    if not req.executed:
        return WatcherResult(**base, verdict=WatcherVerdict.INSUFFICIENT_EVIDENCE,
                             finding="No executed change to observe.",
                             null_reason="not_executed")

    opened = req.observation_window_opened_at
    if not opened:
        return WatcherResult(**base, verdict=WatcherVerdict.INSUFFICIENT_EVIDENCE,
                             finding="No observation window recorded on the receipt.",
                             null_reason="observation_window_unavailable")
    opened_dt = datetime.fromisoformat(opened)
    window_secs = parse_window_seconds(req.observation_window)
    window_open = now < opened_dt + timedelta(seconds=window_secs)
    obs = observation or Observation()

    ev = [
        _ev("execution_mode", req.execution_mode, "ade_ops_approvals"),
        _ev("observation_window_opened_at", opened, "ade_ops_approvals"),
        _ev("evidence_status", obs.evidence_status, obs.source or "observation"),
    ]

    # Failed / stale telemetry → degraded (don't wait out the window on a bad signal).
    if obs.evidence_status in ("failed", "stale"):
        return WatcherResult(**base, verdict=WatcherVerdict.DEGRADED, window_open=window_open,
                             finding=f"Observed telemetry is {obs.evidence_status}.",
                             recommendation="Investigate the degraded signal before trusting this change.",
                             evidence=ev, null_reason=f"telemetry_{obs.evidence_status}")

    # No usable evidence → insufficient_evidence (NOT success).
    if obs.evidence_status == "missing" or obs.expected is None or obs.observed is None:
        verdict = WatcherVerdict.STILL_OBSERVING if window_open else WatcherVerdict.INSUFFICIENT_EVIDENCE
        return WatcherResult(**base, verdict=verdict, window_open=window_open,
                             finding=("Window still open; awaiting observation evidence."
                                      if window_open else "No observation evidence within the window."),
                             evidence=ev,
                             null_reason=None if window_open else "no_observation_evidence")

    # We have expected + observed numbers.
    ev.append(_ev("expected", obs.expected, obs.source or "observation"))
    ev.append(_ev("observed", obs.observed, obs.source or "observation"))
    band = abs(obs.expected) * obs.tolerance
    if obs.lower_is_better:
        worse = obs.observed > obs.expected + band
    else:
        worse = obs.observed < obs.expected - band

    if worse:
        return WatcherResult(**base, verdict=WatcherVerdict.ROLLBACK_RECOMMENDED, window_open=window_open,
                             finding=f"Observed {obs.observed} is worse than expected {obs.expected}.",
                             recommendation=("Rollback RECOMMENDED (artifact only — not executed). "
                                             "A human reviews and applies the rollback through the gate."),
                             evidence=ev)

    # Improved or stable. If the window is still open we keep observing rather than
    # declaring victory early.
    if window_open:
        return WatcherResult(**base, verdict=WatcherVerdict.STILL_OBSERVING, window_open=True,
                             finding=f"Within tolerance so far ({obs.observed} vs {obs.expected}); window still open.",
                             evidence=ev)
    return WatcherResult(**base, verdict=WatcherVerdict.ACCEPTED, window_open=False,
                         finding=f"Outcome improved/stable ({obs.observed} vs {obs.expected}).",
                         recommendation="Change accepted. No rollback recommended.",
                         evidence=ev)
