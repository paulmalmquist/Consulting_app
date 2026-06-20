"""Deterministic gold materializer (Phase A → gold contract).

Reads the Phase A deterministic frame (`prepare_model_dataset`), computes the
per-observation enriched dicts, encodes the 256-dim state vector, and emits
gold-shaped rows. Dry-run by default; the actual UPSERT is delegated to
`loader.upsert_model_observations`. No connectors, no external network — the
text-embedding half is a deterministic Phase A placeholder until a real
embedding step lands (Phase B/C).
"""

from __future__ import annotations

import functools
import importlib.util
import logging
import math
from pathlib import Path
from typing import Any

import pandas as pd

from .contract import MODEL_OBS_VERSION, QUANT_FEATURE_ORDER, encode_quant_block
from .enrich import _accel, _vel, _z2y  # noqa: PLC2701 — same-package derived series
from .lineage import feature_external_links, feature_lineage
from .readiness import observation_readiness

logger = logging.getLogger(__name__)

GOLD_KEYS = (
    "observation_id", "as_of_date", "model_obs_version",
    "features_raw", "features_normalized", "features_z_score_2y", "features_delta",
    "features_velocity", "features_acceleration", "staleness_seconds",
    "source_quality", "null_reason", "feature_family_coverage",
    "feature_vector", "text_embedding", "narrative_text",
    "forward_return_30d", "risk_event_30d", "theme", "regime_label",
    "is_crisis_anchor", "is_non_event", "model_readiness_score", "readiness_degrade_reasons",
    "lineage_json", "external_links_json", "provenance",
)


@functools.lru_cache(maxsize=1)
def _skills_encoder():
    """Load the spine encoder from skills/ (not a backend package). None if absent."""
    root = Path(__file__).resolve().parents[4]  # repo root
    path = root / "skills" / "historyrhymes" / "services" / "state_vector_encoder.py"
    if not path.exists():
        return None
    spec = importlib.util.spec_from_file_location("hr_state_vector_encoder", path)
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _encode_256(features_normalized: dict[str, float | None]) -> list[float]:
    """256-dim state vector via the spine encoder; fall back to quant‖zero-text.

    Phase A is deterministic and network-free, so the narrative is NOT embedded:
    we call the encoder with an EMPTY narrative (its zero-text fast path, no
    OpenAI call) — the quant half is identical to the spine's, the text half is a
    deterministic zero placeholder. The real text embedding lands in a Phase B/C
    embedding step. The fallback is the canonical quant block (128, L2) ‖ zeros.
    """
    try:
        enc = _skills_encoder()
        if enc is not None:
            vec = enc.encode_state_vector(features_normalized, "")  # empty → deterministic, no network
            if isinstance(vec, list) and len(vec) == 256:
                return [float(x) for x in vec]
    except Exception:  # noqa: BLE001 — fall back deterministically
        logger.debug("spine encoder unavailable; using quant-block fallback")
    return encode_quant_block(features_normalized) + [0.0] * 128


def _derived(panel: pd.DataFrame) -> dict[str, dict[str, pd.Series]]:
    out = {"z2y": {}, "vel": {}, "accel": {}, "delta1d": {}}
    for name in QUANT_FEATURE_ORDER:
        s = panel[name].astype(float)
        out["z2y"][name] = _z2y(s)
        out["vel"][name] = _vel(s, 30)
        out["accel"][name] = _accel(s, 30)
        out["delta1d"][name] = _vel(s, 1)
    return out


def _at(series: pd.Series, pos: int) -> float | None:
    v = series.iloc[pos]
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return float(v)


def build_gold_rows(seed: int = 42, limit: int | None = None) -> list[dict[str, Any]]:
    """Deterministic gold rows from the Phase A frame. `limit` = most-recent N rows."""
    from .runner import prepare_model_dataset  # Phase A contract

    panel = prepare_model_dataset(seed)
    d = _derived(panel)
    n = len(panel)
    positions = range(n) if limit is None else range(max(0, n - limit), n)

    generic_feature = {
        "family": "model_observation",
        "formula": "encode_state_vector(features_normalized, narrative_text)",
        "source_dependencies": list(QUANT_FEATURE_ORDER),
    }
    links = feature_external_links()
    lineage = feature_lineage(generic_feature)

    rows: list[dict[str, Any]] = []
    for pos in positions:
        normalized = {nm: _at(d["z2y"][nm], pos) for nm in QUANT_FEATURE_ORDER}
        narrative = str(panel["narrative_text"].iloc[pos])
        readiness = observation_readiness(panel, pos)
        rows.append({
            "observation_id": str(panel["observation_id"].iloc[pos]),
            "as_of_date": str(panel["as_of_date"].iloc[pos]),
            "model_obs_version": MODEL_OBS_VERSION,
            "features_raw": {nm: _at(panel[nm].astype(float), pos) for nm in QUANT_FEATURE_ORDER},
            "features_normalized": normalized,
            "features_z_score_2y": dict(normalized),
            "features_delta": {nm: _at(d["delta1d"][nm], pos) for nm in QUANT_FEATURE_ORDER},
            "features_velocity": {nm: _at(d["vel"][nm], pos) for nm in QUANT_FEATURE_ORDER},
            "features_acceleration": {nm: _at(d["accel"][nm], pos) for nm in QUANT_FEATURE_ORDER},
            "staleness_seconds": {},  # synthetic = fresh; connectors fill this (Phase B)
            "source_quality": "synthetic",
            "null_reason": None,
            "feature_family_coverage": {},
            "feature_vector": _encode_256(normalized),
            "text_embedding": [0.0] * 128,  # Phase A placeholder text half
            "narrative_text": narrative,
            "forward_return_30d": _at(panel["forward_return_30d"].astype(float), pos),
            "risk_event_30d": int(panel["risk_event_30d"].iloc[pos]),
            "theme": str(panel["theme"].iloc[pos]),
            "regime_label": str(panel["regime_label"].iloc[pos]),
            "is_crisis_anchor": bool(panel["is_crisis_anchor"].iloc[pos]),
            "is_non_event": bool(panel["is_non_event"].iloc[pos]),
            "model_readiness_score": readiness["score"],
            "readiness_degrade_reasons": readiness["degrade_reasons"],
            "lineage_json": lineage,
            "external_links_json": links,
            "provenance": {
                "seed": seed,
                "model_obs_version": MODEL_OBS_VERSION,
                "dataset": "prepare_model_dataset",
                "encoder": "encode_state_vector|quant_fallback",
            },
        })
    return rows


def materialize(seed: int = 42, dry_run: bool = True, limit: int | None = None) -> dict[str, Any]:
    """Build gold rows; UPSERT only when dry_run is False (default True)."""
    rows = build_gold_rows(seed, limit)
    base = {
        "row_count": len(rows),
        "source_quality": "synthetic",
        "model_obs_version": MODEL_OBS_VERSION,
        "sample_observation_id": rows[0]["observation_id"] if rows else None,
    }
    if dry_run:
        return {"status": "planned", **base}
    from .loader import upsert_model_observations

    return {"status": "materialized", **base, **upsert_model_observations(rows)}
