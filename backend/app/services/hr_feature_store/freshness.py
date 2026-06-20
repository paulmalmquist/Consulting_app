"""Cadence-aware staleness for feature-store pipeline status.

A daily series stale != a minute series stale, so freshness thresholds are keyed
by the source's expected cadence. Pure + clock-injected (no implicit now()) so it
is deterministic and testable.
"""

from __future__ import annotations

from datetime import datetime

# Max acceptable lag before a surface is considered stale, per cadence (seconds).
CADENCE_MAX_LAG_SECONDS: dict[str, int] = {
    "daily": 3 * 86400,    # weekends + a release-day grace
    "weekly": 10 * 86400,
    "monthly": 40 * 86400,
    "event": 7 * 86400,
}
_DEFAULT_MAX_LAG = 3 * 86400


def compute_status(
    as_of: datetime | None,
    now: datetime,
    cadence: str,
) -> tuple[str, float | None]:
    """Return (status, lag_seconds). as_of=None ⇒ ('unavailable', None)."""
    if as_of is None:
        return "unavailable", None
    lag = (now - as_of).total_seconds()
    max_lag = CADENCE_MAX_LAG_SECONDS.get(cadence, _DEFAULT_MAX_LAG)
    return ("fresh" if lag <= max_lag else "stale"), lag
