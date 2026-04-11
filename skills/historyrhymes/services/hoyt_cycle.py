"""Hoyt 18-year real estate cycle position.

Homer Hoyt's real estate cycle theory anchors the 18-year cycle against the
last confirmed trough. For the post-2008 era that's 2009-Q1 (the S&P 500
trough in March 2009 coincided with the commercial real estate inflection).

The next expected Hoyt peak: 2026-Q4 / 2027-Q1. Current position April 2026
is ~17.1 years into the cycle — beyond the 16.5-year "peak proximity"
threshold used by apply_hoyt_amplification (Section 5.3 of PLAN.md).

This is the SINGLE source of truth for Hoyt math. Both the Databricks
notebooks (02_build_features.py, 04_score_analogs.py) and the backend
FastAPI service import from here.
"""

from __future__ import annotations

from datetime import date

# Anchor: 2009-Q1 trough (S&P 500 bottomed 2009-03-09; we use 2009-03-01 as
# the month-start canonical date for reproducibility).
HOYT_TROUGH_ANCHOR: date = date(2009, 3, 1)

# Cycle length. Hoyt's theory puts this at ~18 years; different authors
# (Fred Harrison, Phil Anderson) give 18.0-18.6. We use 18.0 flat for
# determinism; a future refinement could fit it against historical troughs.
HOYT_CYCLE_YEARS: float = 18.0

# Proximity threshold (in cycle-years) above which an episode tagged
# 'hoyt_peak' receives amplification. 16.5 = ~6 months before peak.
HOYT_PEAK_PROXIMITY_THRESHOLD: float = 16.5

# Phase boundaries (continuous position → discrete label).
# [CONFIRM per PLAN.md Section 5.3]: these defaults are proposed, not user-confirmed.
_PHASE_BOUNDARIES: list[tuple[float, str]] = [
    (4.0, "recovery"),
    (9.0, "expansion"),
    (14.0, "mid_cycle"),
    (17.0, "peak"),
    (18.0, "bust"),
]


def hoyt_cycle_position(d: date) -> float:
    """Return cycle position in years (0.0 - 17.999) anchored to HOYT_TROUGH_ANCHOR.

    Pure function, deterministic. Wraps modulo HOYT_CYCLE_YEARS.
    """
    delta_years = (d - HOYT_TROUGH_ANCHOR).days / 365.25
    return delta_years % HOYT_CYCLE_YEARS


def hoyt_phase_label(position: float) -> str:
    """Discrete phase label from a continuous cycle position.

    See _PHASE_BOUNDARIES. Labels: recovery | expansion | mid_cycle | peak | bust.
    """
    for boundary, label in _PHASE_BOUNDARIES:
        if position < boundary:
            return label
    return "bust"


def hoyt_phase_for_date(d: date) -> tuple[float, str]:
    """Convenience: return (position, phase_label) for a given date."""
    pos = hoyt_cycle_position(d)
    return pos, hoyt_phase_label(pos)
