"""Episode feature builder (History Rhymes Episode Feature Store, Phase 0).

Turns each seeded episode into a labeled training example at one `as_of` window:
derived features (from data <= as_of) + forward-looking targets (from data > as_of),
written to public.episode_features / public.episode_targets with the governed
definitions in public.feature_registry.

Design:
- PURE compute (`compute_episode_rows`) takes a `series_provider` callable and an
  episode descriptor and returns feature/target rows — no DB, no network, no clock —
  so the no-lookahead contract and every value is golden-testable with fixtures.
- PERSISTENCE (`persist_rows`) does the idempotent upsert.
- ORCHESTRATION (`build_phase0`) resolves the 3 seeded episodes from the DB
  (de-duplicating the repeated `episodes` rows by earliest id), pulls FRED history
  via the default provider, computes, and persists.

NO-LOOKAHEAD: features use only observations with date <= as_of; targets use only
observations with date > as_of. Enforced here, not in the transforms.

CADENCE: raw daily/monthly FRED series are resampled to month-end last-observation
so velocity/zscore windows are uniform months across treasury/credit/housing.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Callable, Sequence

from . import transforms

# Series provider: (series_ids, start, end) -> {series_id: [(date, value), ...]}
SeriesProvider = Callable[[Sequence[str], date, date], dict[str, list[tuple[date, float]]]]

MODEL_VERSION = "fs-v0"

# The 3 Phase-0 episodes (exact names as seeded in 435_history_rhymes_seed.sql).
PHASE0_EPISODE_NAMES = (
    "2007-2009 Global Financial Crisis",
    "2016 Brexit Shock (Non-Event)",
    "2020 COVID Crash and V-Shaped Recovery",
)

# ── Governed feature catalog (seeds public.feature_registry) ────────────────────
# Each spec names how to build its input series and which transform to apply.
# `series` is the FRED series id(s); the yield-curve family uses the 10y-2y spread.
FEATURE_SPECS = [
    {"feature_id": "yc_slope", "feature_name": "Yield curve slope (10y-2y)",
     "family": "yield_curve", "transform": "level", "params": {},
     "raw_sources": ["FRED:DGS10", "FRED:DGS2"], "window_days": None,
     "value_kind": "numeric", "unit": "pct_points",
     "series": "yc_spread", "description": "10y minus 2y Treasury yield (latest, month-end)."},
    {"feature_id": "yc_velocity", "feature_name": "Yield curve velocity (1m)",
     "family": "yield_curve", "transform": "velocity", "params": {"periods": 1},
     "raw_sources": ["FRED:DGS10", "FRED:DGS2"], "window_days": 30,
     "value_kind": "numeric", "unit": "pct_points_per_month",
     "series": "yc_spread", "description": "1-month change in the 10y-2y spread."},
    {"feature_id": "yc_acceleration", "feature_name": "Yield curve acceleration",
     "family": "yield_curve", "transform": "acceleration", "params": {"periods": 1},
     "raw_sources": ["FRED:DGS10", "FRED:DGS2"], "window_days": 60,
     "value_kind": "numeric", "unit": "pct_points_per_month2",
     "series": "yc_spread", "description": "Change in yield-curve velocity (2nd difference)."},
    {"feature_id": "yc_zscore", "feature_name": "Yield curve z-score (2y)",
     "family": "yield_curve", "transform": "zscore", "params": {"window": 24},
     "raw_sources": ["FRED:DGS10", "FRED:DGS2"], "window_days": 730,
     "value_kind": "numeric", "unit": "sigma",
     "series": "yc_spread", "description": "Standardized 10y-2y spread over a trailing 24 months."},
    {"feature_id": "yc_regime", "feature_name": "Yield curve regime",
     "family": "yield_curve", "transform": "regime",
     "params": {"thresholds": [0.0, 0.5], "labels": ["inverted", "flat", "steep"]},
     "raw_sources": ["FRED:DGS10", "FRED:DGS2"], "window_days": None,
     "value_kind": "categorical", "unit": None,
     "series": "yc_spread", "description": "inverted (<0) | flat (0-0.5) | steep (>=0.5)."},
    {"feature_id": "credit_spread_velocity", "feature_name": "HY credit spread velocity (1m)",
     "family": "credit", "transform": "velocity", "params": {"periods": 1},
     "raw_sources": ["FRED:BAMLC0A0CM"], "window_days": 30,
     "value_kind": "numeric", "unit": "pct_points_per_month",
     "series": "BAMLC0A0CM", "description": "1-month change in HY OAS credit spread."},
    {"feature_id": "housing_velocity", "feature_name": "Housing starts velocity (1m)",
     "family": "housing", "transform": "velocity", "params": {"periods": 1},
     "raw_sources": ["FRED:HOUST"], "window_days": 30,
     "value_kind": "numeric", "unit": "thousands_per_month",
     "series": "HOUST", "description": "1-month change in housing starts (SAAR, thousands)."},
]

# All FRED series the builder needs (features + targets).
FEATURE_SERIES_IDS = ("DGS10", "DGS2", "BAMLC0A0CM", "HOUST")
TARGET_SERIES_IDS = ("SP500", "USREC")
ALL_SERIES_IDS = tuple(dict.fromkeys(FEATURE_SERIES_IDS + TARGET_SERIES_IDS))

# Features need trailing history; targets need ~13 months forward.
FEATURE_LOOKBACK_DAYS = 800   # ~26 months, covers the 24-month z-score window
TARGET_HORIZON_DAYS = 365


@dataclass(frozen=True)
class FeatureRow:
    feature_id: str
    value: float | None
    value_label: str | None
    null_reason: str | None
    inputs_hash: str
    data_provenance: str


@dataclass(frozen=True)
class TargetRow:
    target_name: str
    horizon_days: int
    value: float | None
    null_reason: str | None
    source_lineage: str
    data_provenance: str


@dataclass(frozen=True)
class EpisodeDescriptor:
    episode_id: str
    name: str
    as_of: date


# ── series helpers ──────────────────────────────────────────────────────────────

def _to_monthly(points: list[tuple[date, float]]) -> list[tuple[date, float]]:
    """Resample to one value per calendar month: the last observation in the month.
    Returns [(month_key_date, value)] ascending, month_key = first of month."""
    by_month: dict[tuple[int, int], tuple[date, float]] = {}
    for d, v in sorted(points, key=lambda p: p[0]):
        key = (d.year, d.month)
        prev = by_month.get(key)
        if prev is None or d >= prev[0]:
            by_month[key] = (d, v)
    return [(date(y, m, 1), val) for (y, m), (_, val) in sorted(by_month.items())]


def _spread_monthly(
    dgs10: list[tuple[date, float]], dgs2: list[tuple[date, float]]
) -> list[tuple[date, float]]:
    """Monthly 10y-2y spread, aligned on the months present in both series."""
    m10 = dict(_to_monthly(dgs10))
    m2 = dict(_to_monthly(dgs2))
    common = sorted(set(m10) & set(m2))
    return [(k, m10[k] - m2[k]) for k in common]


def _values_upto(monthly: list[tuple[date, float]], as_of: date) -> list[float]:
    return [v for d, v in monthly if d <= as_of]


def _coerce_date(d) -> date:
    return d if isinstance(d, date) else date.fromisoformat(str(d)[:10])


def _hash_inputs(series: dict[str, list[tuple[date, float]]]) -> str:
    payload = {sid: [(d.isoformat(), round(v, 6)) for d, v in pts]
               for sid, pts in sorted(series.items())}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:32]


# ── pure compute ────────────────────────────────────────────────────────────────

def compute_episode_rows(
    episode: EpisodeDescriptor,
    series_provider: SeriesProvider,
    provenance: str = "public_fred",
) -> dict[str, list]:
    """Compute feature + target rows for one episode at its as_of window. Pure."""
    as_of = episode.as_of
    win_start = as_of - timedelta(days=FEATURE_LOOKBACK_DAYS)
    win_end = as_of + timedelta(days=TARGET_HORIZON_DAYS + 31)
    raw = series_provider(list(ALL_SERIES_IDS), win_start, win_end)
    # normalize dates AND clip to the requested window. The keyless fredgraph CSV
    # endpoint ignores the date range for some series (e.g. BAMLC0A0CM, SP500) and
    # returns recent data instead — clipping prevents wrong-era contamination
    # (a 2007 as_of must never borrow 2016 values) and yields an honest null when a
    # series has no data in-window.
    raw = {
        sid: [(_coerce_date(d), float(v)) for d, v in pts
              if win_start <= _coerce_date(d) <= win_end]
        for sid, pts in raw.items()
    }

    # Prepare the named input series (monthly), including the derived yc_spread.
    prepared: dict[str, list[tuple[date, float]]] = {
        sid: _to_monthly(raw.get(sid, [])) for sid in FEATURE_SERIES_IDS
    }
    prepared["yc_spread"] = _spread_monthly(raw.get("DGS10", []), raw.get("DGS2", []))
    inputs_hash = _hash_inputs({k: prepared[k] for k in sorted(prepared)})

    features: list[FeatureRow] = []
    for spec in FEATURE_SPECS:
        series = _values_upto(prepared.get(spec["series"], []), as_of)  # no-lookahead
        res = transforms.compute(spec["transform"], series, **spec["params"])
        features.append(FeatureRow(
            feature_id=spec["feature_id"],
            value=res.value,
            value_label=res.label,
            null_reason=res.null_reason,
            inputs_hash=inputs_hash,
            data_provenance=provenance,
        ))

    targets = _compute_targets(raw, as_of, provenance)
    return {"features": features, "targets": targets}


def _forward(points: list[tuple[date, float]], as_of: date) -> list[tuple[date, float]]:
    """Observations strictly after as_of (the no-lookahead target window)."""
    return [(d, v) for d, v in sorted(points) if d > as_of]


def _value_at_or_after(points: list[tuple[date, float]], target: date) -> float | None:
    for d, v in points:
        if d >= target:
            return v
    return None


def _compute_targets(
    raw: dict[str, list[tuple[date, float]]], as_of: date, provenance: str
) -> list[TargetRow]:
    spx_all = sorted(raw.get("SP500", []))
    usrec_fwd = _forward(raw.get("USREC", []), as_of)
    spx_fwd = _forward(spx_all, as_of)
    base = _value_at_or_after(sorted(spx_all), as_of)  # baseline at/after as_of

    rows: list[TargetRow] = []

    # outcome_3m: SP500 forward total return as_of -> as_of+90d
    end_val = _value_at_or_after(spx_fwd, as_of + timedelta(days=90))
    if base and end_val is not None:
        rows.append(TargetRow("outcome_3m", 90, end_val / base - 1.0, None,
                              "FRED:SP500 forward return as_of+90d", provenance))
    else:
        rows.append(TargetRow("outcome_3m", 90, None, "source_unavailable",
                              "FRED:SP500 forward return as_of+90d", provenance))

    # drawdown: worst peak-to-trough decline within (as_of, as_of+365d]
    horizon = [(d, v) for d, v in spx_fwd if d <= as_of + timedelta(days=TARGET_HORIZON_DAYS)]
    if base and horizon:
        peak = base
        worst = 0.0
        for _, v in horizon:
            peak = max(peak, v)
            worst = min(worst, v / peak - 1.0)
        rows.append(TargetRow("drawdown", TARGET_HORIZON_DAYS, worst, None,
                              "FRED:SP500 max peak-to-trough within 365d", provenance))
    else:
        rows.append(TargetRow("drawdown", TARGET_HORIZON_DAYS, None, "source_unavailable",
                              "FRED:SP500 max peak-to-trough within 365d", provenance))

    # recession_flag: USREC max within (as_of, as_of+365d]
    rec_window = [v for d, v in usrec_fwd if d <= as_of + timedelta(days=TARGET_HORIZON_DAYS)]
    if rec_window:
        rows.append(TargetRow("recession_flag", TARGET_HORIZON_DAYS,
                              1.0 if max(rec_window) >= 1.0 else 0.0, None,
                              "FRED:USREC max within 365d", provenance))
    else:
        rows.append(TargetRow("recession_flag", TARGET_HORIZON_DAYS, None, "source_unavailable",
                              "FRED:USREC max within 365d", provenance))

    return rows


# ── persistence + orchestration (DB) ─────────────────────────────────────────────

def seed_feature_registry(cur) -> None:
    """Upsert the governed feature definitions (episode_features FKs this)."""
    for s in FEATURE_SPECS:
        cur.execute(
            """
            INSERT INTO public.feature_registry
                (feature_id, feature_name, family, transform, raw_sources,
                 window_days, value_kind, unit, description, owner)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'history-rhymes')
            ON CONFLICT (feature_id) DO UPDATE SET
                feature_name=EXCLUDED.feature_name, family=EXCLUDED.family,
                transform=EXCLUDED.transform, raw_sources=EXCLUDED.raw_sources,
                window_days=EXCLUDED.window_days, value_kind=EXCLUDED.value_kind,
                unit=EXCLUDED.unit, description=EXCLUDED.description, updated_at=NOW();
            """,
            (s["feature_id"], s["feature_name"], s["family"], s["transform"],
             s["raw_sources"], s["window_days"], s["value_kind"], s["unit"], s["description"]),
        )


def persist_rows(cur, episode_id: str, as_of: date, rows: dict[str, list]) -> tuple[int, int]:
    """Idempotent upsert of computed feature/target rows for one episode."""
    fcount = 0
    for r in rows["features"]:
        cur.execute(
            """
            INSERT INTO public.episode_features
                (entity_type, entity_id, episode_id, as_of_date, feature_id,
                 value, value_label, null_reason, inputs_hash, freshness_hours,
                 model_version, data_provenance)
            VALUES ('hr_episode',%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s,%s)
            ON CONFLICT (entity_type, entity_id, as_of_date, feature_id, model_version)
            DO UPDATE SET value=EXCLUDED.value, value_label=EXCLUDED.value_label,
                null_reason=EXCLUDED.null_reason, inputs_hash=EXCLUDED.inputs_hash,
                data_provenance=EXCLUDED.data_provenance, computed_at=NOW();
            """,
            (episode_id, episode_id, as_of, r.feature_id, r.value, r.value_label,
             r.null_reason, r.inputs_hash, MODEL_VERSION, r.data_provenance),
        )
        fcount += 1
    tcount = 0
    for t in rows["targets"]:
        cur.execute(
            """
            INSERT INTO public.episode_targets
                (entity_type, entity_id, episode_id, as_of_date, target_name,
                 horizon_days, value, null_reason, source_lineage, data_provenance)
            VALUES ('hr_episode',%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (entity_type, entity_id, as_of_date, target_name, horizon_days)
            DO UPDATE SET value=EXCLUDED.value, null_reason=EXCLUDED.null_reason,
                source_lineage=EXCLUDED.source_lineage,
                data_provenance=EXCLUDED.data_provenance, computed_at=NOW();
            """,
            (episode_id, episode_id, as_of, t.target_name, t.horizon_days,
             t.value, t.null_reason, t.source_lineage, t.data_provenance),
        )
        tcount += 1
    return fcount, tcount


def _default_fred_provider(series_ids, start, end):
    # Lazy import so the pure path / tests never require the connector deps.
    # Uses the KEYLESS fredgraph CSV endpoint — real FRED data, no FRED_API_KEY.
    from app.connectors.cre.fred_rates.fetch import fetch_series_history_csv
    hist = fetch_series_history_csv(series_ids, start, end)
    return {sid: [(date.fromisoformat(d), v) for d, v in pts] for sid, pts in hist.items()}


def resolve_phase0_episodes(cur) -> list[EpisodeDescriptor]:
    """Resolve the 3 Phase-0 episodes, de-duplicating repeated rows by earliest id."""
    out: list[EpisodeDescriptor] = []
    for name in PHASE0_EPISODE_NAMES:
        cur.execute(
            """
            SELECT id::text AS id, start_date
            FROM public.episodes WHERE name = %s
            ORDER BY created_at NULLS FIRST, id LIMIT 1;
            """,
            (name,),
        )
        row = cur.fetchone()
        if row:
            out.append(EpisodeDescriptor(row["id"], name, _coerce_date(row["start_date"])))
    return out


def build_phase0(cur, series_provider: SeriesProvider | None = None) -> dict:
    """Resolve episodes, compute features+targets at each as_of, persist. Idempotent."""
    provider = series_provider or _default_fred_provider
    provenance = "public_fred" if series_provider is None else "fixture"
    seed_feature_registry(cur)
    episodes = resolve_phase0_episodes(cur)
    summary = {"episodes": [], "features_written": 0, "targets_written": 0}
    for ep in episodes:
        rows = compute_episode_rows(ep, provider, provenance)
        f, t = persist_rows(cur, ep.episode_id, ep.as_of, rows)
        summary["episodes"].append({"name": ep.name, "as_of": ep.as_of.isoformat(),
                                    "features": f, "targets": t})
        summary["features_written"] += f
        summary["targets_written"] += t
    return summary
