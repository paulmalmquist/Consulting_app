"""Immutable promotion receipts (C4).

A receipt is the write-once record of why a candidate reached approval/promotion.
Evidence is fingerprinted with a deterministic JSON hash so a receipt can be
verified later without storing the full payload twice. Receipts are never silently
overwritten: a new receipt for the same candidate pushes the prior one into
`receipt_history` and bumps `version`. Pure; no DB, no network.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

RECEIPT_SCHEMA_VERSION = "hr-promotion-receipt-v1"


def stable_hash(payload: Any) -> str:
    """Deterministic SHA-256 over canonical JSON (sorted keys, no whitespace drift).

    None/{} hash to a stable sentinel so a 'missing evidence' receipt is still
    verifiable rather than ambiguous."""
    if payload is None:
        payload = {}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_receipt(candidate: dict[str, Any], *, generated_at: str | None = None) -> dict[str, Any]:
    """One immutable receipt payload for a candidate at its current approval state.

    `generated_at` is passed in (callers stamp time) so this stays pure/deterministic."""
    return {
        "schema_version": RECEIPT_SCHEMA_VERSION,
        "candidate_id": candidate.get("candidate_id"),
        "observation_id": candidate.get("observation_id"),
        "model_obs_version": candidate.get("model_obs_version"),
        "embedding_model_version": candidate.get("embedding_model_version"),
        "approval_actor": candidate.get("approval_actor"),
        "approval_timestamp": candidate.get("approval_timestamp"),
        "approval_status": candidate.get("approval_status"),
        "candidate_type": candidate.get("candidate_type"),
        "candidate_label": candidate.get("candidate_label"),
        "condition_cluster": candidate.get("condition_cluster"),
        "calibration_evidence_hash": stable_hash(candidate.get("calibration_evidence_json")),
        "no_lookahead_audit_hash": stable_hash(candidate.get("no_lookahead_audit_json")),
        "non_event_context_hash": stable_hash(candidate.get("non_event_context_json")),
        "lineage_hash": stable_hash(candidate.get("lineage_json")),
        "features_snapshot_hash": stable_hash(candidate.get("features_snapshot")),
        "created_episode_id": candidate.get("created_episode_id"),
        "receipt_generated_at": generated_at,
    }


def append_receipt(existing: dict[str, Any] | None, receipt: dict[str, Any]) -> dict[str, Any]:
    """Append a receipt without overwriting prior ones.

    The current receipt lives at the top level; any prior current receipt is moved
    into `receipt_history`. `version` counts receipts issued for this candidate."""
    existing = existing or {}
    history = list(existing.get("receipt_history", []))
    prior = {k: v for k, v in existing.items() if k not in ("receipt_history", "version")}
    if prior:  # there was a previous current receipt → preserve it
        history.append(prior)
    version = int(existing.get("version", 0)) + 1
    return {**receipt, "version": version, "receipt_history": history}
