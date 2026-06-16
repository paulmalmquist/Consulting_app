"""Deterministic, clearly-labeled fixture series for the Phase 0 backfill.

Used ONLY when a live FRED key is not available. It lets the full loop
(builder -> transforms -> store -> API -> Observatory) run on concrete data today;
rows land with data_provenance='fixture' and the UI shows status=experimental.

Honesty:
- The macro series (yields, credit, housing, SP500) are SYNTHETIC and labeled as
  such — they are NOT presented as real FRED observations.
- USREC uses FACTUAL NBER recession months, so `recession_flag` is genuinely
  correct per episode (GFC=1, Brexit=0, COVID=1) — the target the smoke model uses.

Swap to real data with: `build_phase0(cur)` (no provider) once FRED_API_KEY is set.
"""

from __future__ import annotations

import math
from datetime import date

# Factual NBER recession months (inclusive). Source: NBER business-cycle dating.
_RECESSION_MONTHS: set[tuple[int, int]] = set()
for _y, _m0, _m1 in [(2007, 12, 12), (2008, 1, 12), (2009, 1, 6)]:
    for _m in range(_m0, _m1 + 1):
        _RECESSION_MONTHS.add((_y, _m))
for _m in range(2, 5):  # COVID recession Feb-Apr 2020
    _RECESSION_MONTHS.add((2020, _m))


def _months(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield date(y, m, 1)
        m += 1
        if m > 12:
            m, y = 1, y + 1


def _idx(d: date) -> int:
    return (d.year - 2004) * 12 + (d.month - 1)


def fixture_series_provider(series_ids, start, end):
    """Deterministic synthetic monthly series across [start, end]. No randomness."""
    out: dict[str, list[tuple[date, float]]] = {sid: [] for sid in series_ids}
    for d in _months(start, end):
        b = _idx(d)
        vals = {
            "DGS10": 3.5 + 0.3 * math.sin(b / 6.0),
            "DGS2": 2.5 + 0.5 * math.sin(b / 6.0 + 0.5),
            "BAMLC0A0CM": 4.0 + 1.0 * math.sin(b / 9.0),
            "HOUST": 1400.0 + 100.0 * math.sin(b / 8.0),
            "SP500": 1000.0 * (1.004 ** b),
            "USREC": 1.0 if (d.year, d.month) in _RECESSION_MONTHS else 0.0,
        }
        for sid in series_ids:
            if sid in vals:
                out[sid].append((d, round(vals[sid], 4)))
    return out
