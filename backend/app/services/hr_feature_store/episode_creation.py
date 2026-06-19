"""C10 — create an `episodes` row from an APPROVED promotion candidate.

This is the first execution step after approval (C9 stages 1-5). It validates
eligibility + human-authored episode fields and inserts EXACTLY ONE `episodes`
row. It does NOT create an embedding, does NOT seal the candidate
(`record_promoted_episode_link`), does NOT change candidate status, and never
calls an encoder/LLM. Creating an episode adds reviewed historical memory; it does
NOT make the episode searchable — that needs a later episode_embeddings row.

Verified `episodes` NOT NULL fields (434_history_rhymes_wss.sql): name,
asset_class, start_date, macro_conditions_entering, catalyst_trigger,
timeline_narrative. `source` exists (set 'promotion'); there is NO origin column
(C9-documented gap → C11), so origin stays in the audit/response, not the row.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.services.hr_feature_store.promotion_candidates import (
    APPROVED, PROMOTED, REJECTED, SUPERSEDED, evidence_blockers,
)

# Human-authored, NOT NULL on episodes. Each maps to a missing_<field> reason.
REQUIRED_EPISODE_FIELDS = (
    "name", "asset_class", "start_date",
    "macro_conditions_entering", "catalyst_trigger", "timeline_narrative",
)

# Values that look like a placeholder rather than authored content → blocked.
PLACEHOLDER_VALUES = {"tbd", "unknown", "n/a", "na", "auto-generated",
                      "generated from observation", "todo", "-", "--"}

# Optional pass-through episode fields (nullable on the table).
OPTIONAL_EPISODE_FIELDS = (
    "category", "peak_date", "trough_date", "end_date", "tags",
    "regime_type", "dalio_cycle_stage", "narrative_arc", "recovery_pattern",
    "modern_analog_thesis", "volatility_regime",
)


class EpisodeCreationError(Exception):
    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__(", ".join(reasons))


class EpisodeRepository(Protocol):
    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None: ...
    def insert_episode(self, episode: dict[str, Any]) -> str: ...  # returns episode_id


# --- eligibility ------------------------------------------------------------


def eligibility_blockers(candidate: dict[str, Any]) -> list[str]:
    """Why this candidate may NOT enter episode creation. Empty ⇒ eligible."""
    reasons: list[str] = []
    status = candidate.get("approval_status")
    if status == PROMOTED:
        reasons.append("candidate_already_promoted")
    elif status == REJECTED:
        reasons.append("candidate_rejected")
    elif status == SUPERSEDED:
        reasons.append("candidate_superseded")
    elif status != APPROVED:
        reasons.append("candidate_not_approved")

    if candidate.get("created_episode_id"):
        reasons.append("candidate_already_has_episode")
    if not candidate.get("approval_actor"):
        reasons.append("missing_approval_actor")
    if not candidate.get("approval_timestamp"):
        reasons.append("missing_approval_timestamp")
    if not candidate.get("promotion_receipt_json"):
        reasons.append("missing_promotion_receipt")
    # carry forward the C4 evidence gate (calibration / no-lookahead / non-event / …)
    reasons.extend(evidence_blockers(candidate))
    # de-dup, preserve order
    return list(dict.fromkeys(reasons))


# --- field validation -------------------------------------------------------


def _is_placeholder(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in PLACEHOLDER_VALUES


def field_blockers(episode: dict[str, Any]) -> list[str]:
    """Missing/placeholder required fields → exact per-field reasons."""
    reasons: list[str] = []
    for f in REQUIRED_EPISODE_FIELDS:
        v = episode.get(f)
        if v is None or (isinstance(v, str) and not v.strip()) or _is_placeholder(v):
            reasons.append(f"missing_episode_{f}" if f == "name" else f"missing_{f}")
    return reasons


def build_episode_preview(candidate: dict[str, Any], episode: dict[str, Any]) -> dict[str, Any]:
    """Merge candidate proposed_* defaults under the reviewer-authored payload.

    Defaults only FILL THE FORM for validation; they never invent a required value
    (a candidate proposed_* that is itself missing/placeholder stays missing)."""
    defaults = {
        "name": candidate.get("proposed_episode_name"),
        "asset_class": candidate.get("proposed_asset_class"),
        "category": candidate.get("proposed_category"),
        "start_date": candidate.get("proposed_start_date"),
        "peak_date": candidate.get("proposed_peak_date"),
        "trough_date": candidate.get("proposed_trough_date"),
        "end_date": candidate.get("proposed_end_date"),
        "tags": candidate.get("proposed_tags"),
        "is_non_event": candidate.get("candidate_label") == "non_event",
    }
    merged = {k: v for k, v in defaults.items() if v is not None}
    merged.update({k: v for k, v in episode.items() if v is not None})
    merged["source"] = "promotion"
    return merged


# --- operations -------------------------------------------------------------


def validate_episode(repo: EpisodeRepository, candidate_id: str,
                     episode: dict[str, Any]) -> dict[str, Any]:
    """Eligibility + field validation only. Never writes. Raises on block."""
    candidate = repo.get_candidate(candidate_id)
    if candidate is None:
        raise EpisodeCreationError(["candidate_not_found"])
    reasons = eligibility_blockers(candidate)
    preview = build_episode_preview(candidate, episode)
    reasons.extend(field_blockers(preview))
    reasons = list(dict.fromkeys(reasons))
    if reasons:
        raise EpisodeCreationError(reasons)
    return {"status": "eligible", "candidate_id": candidate_id,
            "episode_preview": preview, "blocked_reasons": []}


def create_episode(repo: EpisodeRepository, candidate_id: str,
                   episode: dict[str, Any]) -> dict[str, Any]:
    """Validate then insert exactly one episodes row. Returns the new episode_id.

    Does NOT write an embedding, seal the candidate, or change candidate status —
    so the episode is created but NOT searchable yet."""
    result = validate_episode(repo, candidate_id, episode)  # raises on block
    preview = result["episode_preview"]
    # keep only real episodes columns
    row = {k: preview[k] for k in (("source",) + REQUIRED_EPISODE_FIELDS + OPTIONAL_EPISODE_FIELDS + ("is_non_event",))
           if k in preview}
    episode_id = repo.insert_episode(row)
    return {
        "status": "created",
        "candidate_id": candidate_id,
        "episode_id": episode_id,
        "searchable": False,            # no embedding yet
        "embedding_status": "not_created",
        "next_required_step": "create_episode_embedding",
    }


# --- live DB repository (fail-soft reads; single append-only episodes insert) -


class DbEpisodeRepository:
    """Reads the candidate via the C4 store; inserts ONE episodes row. Never
    touches episode_embeddings, never seals the candidate."""

    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None:
        from app.services.hr_feature_store.promotion_candidates import DbCandidateRepository
        return DbCandidateRepository().get(candidate_id)

    def insert_episode(self, episode: dict[str, Any]) -> str:
        from app.db import get_cursor
        cols = [k for k in episode if episode[k] is not None]
        placeholders = ", ".join(f"%({c})s" for c in cols)
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO episodes ({', '.join(cols)}) VALUES ({placeholders}) RETURNING id",
                {c: episode[c] for c in cols},
            )
            row = cur.fetchone()
            return str(row["id"] if isinstance(row, dict) else row[0])
