"""Gate primitives for the episode-embeddings backfill (pure; no DB/network).

A batch is write-eligible only if every gate passes. Thresholds are explicit and
conservative: calibration (Brier<0.22, permutation p<0.05), no-lookahead, a real
model_version bump, the 256-dim contract, promotable source_quality, a resolvable
episode mapping, non-overwrite, and the 2:1 non-event coverage the HR design
mandates. Missing evidence is `missing` (treated as a block), never assumed pass.
"""

from __future__ import annotations

from typing import Any

BRIER_THRESHOLD = 0.22
PERMUTATION_P_THRESHOLD = 0.05
FEATURE_VECTOR_DIM = 256
NON_EVENT_RATIO_TARGET = 2.0
ALLOWED_SOURCE_QUALITY = frozenset({"live"})  # synthetic/fixture/fallback NOT promotable to the live spine
ENCODER_DEFAULT_VERSION = "concat-l2-v1"      # the existing default; a bump must differ + be new


def gate_brier(evidence: dict[str, Any] | None) -> dict[str, Any]:
    v = (evidence or {}).get("brier_score")
    if v is None:
        return {"status": "missing", "value": None, "threshold": BRIER_THRESHOLD}
    v = float(v)
    return {"status": "pass" if v < BRIER_THRESHOLD else "fail", "value": round(v, 4), "threshold": BRIER_THRESHOLD}


def gate_permutation(evidence: dict[str, Any] | None) -> dict[str, Any]:
    v = (evidence or {}).get("permutation_p_value")
    if v is None:
        return {"status": "missing", "value": None, "threshold": PERMUTATION_P_THRESHOLD}
    v = float(v)
    return {"status": "pass" if v < PERMUTATION_P_THRESHOLD else "fail", "value": round(v, 6),
            "threshold": PERMUTATION_P_THRESHOLD}


def gate_no_lookahead(audit: dict[str, Any]) -> dict[str, Any]:
    return {"status": "pass" if audit.get("passed") else "fail",
            "violation_count": len(audit.get("violations", []))}


def gate_model_version_bump(requested: str | None, existing_versions: set[str],
                            evidence: dict[str, Any] | None) -> dict[str, Any]:
    if not requested:
        return {"status": "missing", "value": None}
    if requested == ENCODER_DEFAULT_VERSION or requested in existing_versions:
        return {"status": "fail", "value": requested, "reason": "version_not_new"}
    ev_version = (evidence or {}).get("model_version")
    if ev_version and ev_version != requested:
        return {"status": "fail", "value": requested, "reason": "evidence_version_mismatch"}
    return {"status": "pass", "value": requested}


def gate_non_event_coverage(rows: list[dict[str, Any]]) -> dict[str, Any]:
    crisis = sum(1 for r in rows if r.get("is_crisis_anchor"))
    non_event = sum(1 for r in rows if r.get("is_non_event"))
    if crisis == 0 and non_event == 0:
        return {"status": "missing", "crisis_anchor_count": 0, "non_event_count": 0,
                "non_event_to_event_ratio": None, "target": NON_EVENT_RATIO_TARGET}
    ratio = float("inf") if crisis == 0 else non_event / crisis
    status = "pass" if ratio >= NON_EVENT_RATIO_TARGET else "degraded" if ratio >= 1.0 else "fail"
    return {
        "status": status,
        "crisis_anchor_count": crisis,
        "non_event_count": non_event,
        "non_event_to_event_ratio": None if ratio == float("inf") else round(ratio, 3),
        "target": NON_EVENT_RATIO_TARGET,
    }


def row_gate_failures(candidate: dict[str, Any], *, episode_id: str | None,
                      duplicate: bool, no_lookahead_ok: bool) -> list[str]:
    """Per-row gate failures; empty list ⇒ row is eligible."""
    reasons: list[str] = []
    vec = candidate.get("feature_vector")
    if not (isinstance(vec, list) and len(vec) == FEATURE_VECTOR_DIM):
        reasons.append("feature_vector_dim_mismatch")
    if candidate.get("source_quality") not in ALLOWED_SOURCE_QUALITY:
        reasons.append("source_quality_not_promotable")
    if not no_lookahead_ok:
        reasons.append("lookahead_violation")
    if episode_id is None:
        reasons.append("episode_mapping_unresolved")
    if duplicate:
        reasons.append("duplicate_for_model_version")
    return reasons
