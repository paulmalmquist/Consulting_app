"""Promotion-candidate storage + status machine (C4) — the airlock.

Storage only. These functions move a candidate through the reviewed promotion
status machine and enforce the evidence gate; they do NOT create episodes, write
episode_embeddings, call embedding providers, or auto-promote anything. The DB
repository is fail-soft; tests inject a fake in-memory repo.

Status machine:
    draft ─► needs_evidence ─► needs_review ─► approved ─► promoted (terminal)
                                   │              └─► superseded
                                   └─► rejected
Only `approved` + a `created_episode_id` may become `promoted`. `promoted` is
terminal. `rejected` cannot become `approved` (open a new candidate). Approval
requires every evidence gate to pass AND a human `approval_actor`.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.services.hr_feature_store.promotion_receipts import append_receipt, build_receipt

# --- status machine ---------------------------------------------------------
DRAFT = "draft"
NEEDS_EVIDENCE = "needs_evidence"
NEEDS_REVIEW = "needs_review"
APPROVED = "approved"
REJECTED = "rejected"
SUPERSEDED = "superseded"
PROMOTED = "promoted"

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    DRAFT: {NEEDS_EVIDENCE, NEEDS_REVIEW},
    NEEDS_EVIDENCE: {NEEDS_REVIEW, REJECTED},
    NEEDS_REVIEW: {APPROVED, REJECTED, NEEDS_EVIDENCE},
    APPROVED: {PROMOTED, SUPERSEDED},
    REJECTED: set(),           # terminal: re-review requires a NEW candidate
    SUPERSEDED: set(),         # terminal
    PROMOTED: set(),           # terminal
}

NON_EVENT_RATIO_TARGET = 2.0


class PromotionCandidateError(Exception):
    """Raised for a blocked operation; carries explicit reasons."""

    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__(", ".join(reasons))


# --- repository abstraction --------------------------------------------------


class CandidateRepository(Protocol):
    def insert(self, candidate: dict[str, Any]) -> dict[str, Any]: ...
    def get(self, candidate_id: str) -> dict[str, Any] | None: ...
    def list(self, *, status: str | None = None, candidate_type: str | None = None) -> list[dict[str, Any]]: ...
    def update(self, candidate_id: str, patch: dict[str, Any]) -> dict[str, Any]: ...


# --- evidence gate -----------------------------------------------------------


def evidence_blockers(candidate: dict[str, Any]) -> list[str]:
    """Reasons a candidate is not yet review/approval-ready. Empty ⇒ ready."""
    reasons: list[str] = []
    if not candidate.get("calibration_evidence_json"):
        reasons.append("missing_calibration_evidence")
    audit = candidate.get("no_lookahead_audit_json") or {}
    if not audit:
        reasons.append("missing_no_lookahead_audit")
    elif audit.get("passed") is not True:
        reasons.append("no_lookahead_failed")
    if not candidate.get("non_event_context_json"):
        reasons.append("missing_non_event_context")
    if not candidate.get("features_snapshot"):
        reasons.append("missing_features_snapshot")
    if not candidate.get("lineage_json"):
        reasons.append("missing_lineage")
    if not (candidate.get("narrative_summary") or "").strip():
        reasons.append("missing_narrative_summary")
    return reasons


def non_event_coverage(candidate: dict[str, Any]) -> dict[str, Any]:
    """Read-only view of non-event discipline from non_event_context_json."""
    ctx = candidate.get("non_event_context_json") or {}
    crisis = int(ctx.get("crisis_anchor_count") or 0)
    non_event = int(ctx.get("non_event_count") or 0)
    ratio = ctx.get("non_event_to_event_ratio")
    if ratio is None:
        ratio = (non_event / crisis) if crisis else (float("inf") if non_event else 0.0)
    meets = ratio >= NON_EVENT_RATIO_TARGET
    override_reason = ctx.get("override_reason")
    return {
        "condition_cluster": ctx.get("condition_cluster"),
        "crisis_anchor_count": crisis,
        "non_event_count": non_event,
        "non_event_to_event_ratio": None if ratio == float("inf") else round(float(ratio), 3),
        "coverage_status": "pass" if meets else "below_target",
        "override_required": not meets,
        "override_reason": override_reason,
    }


# --- operations --------------------------------------------------------------


def create_candidate(repo: CandidateRepository, candidate: dict[str, Any]) -> dict[str, Any]:
    if not candidate.get("candidate_id"):
        raise PromotionCandidateError(["missing_candidate_id"])
    if repo.get(candidate["candidate_id"]) is not None:
        raise PromotionCandidateError(["duplicate_candidate_id"])
    row = {**candidate}
    row.setdefault("approval_status", DRAFT)
    row.setdefault("promotion_receipt_json", {})
    return repo.insert(row)


def get_candidate(repo: CandidateRepository, candidate_id: str) -> dict[str, Any] | None:
    return repo.get(candidate_id)


def list_candidates(repo: CandidateRepository, *, status: str | None = None,
                    candidate_type: str | None = None) -> list[dict[str, Any]]:
    return repo.list(status=status, candidate_type=candidate_type)


def allowed_actions(candidate: dict[str, Any]) -> list[str]:
    """Read-only: the transitions legal from the candidate's current status. Lets a
    read surface disable forbidden actions without re-implementing the machine."""
    return sorted(ALLOWED_TRANSITIONS.get(candidate.get("approval_status"), set()))


def attach_evidence(repo: CandidateRepository, candidate_id: str,
                    evidence: dict[str, Any]) -> dict[str, Any]:
    """Attach/replace evidence fields (calibration, no-lookahead, non-event, lineage,
    features, narrative, links). Storage only; no status change."""
    c = _require(repo, candidate_id)
    allowed = {
        "calibration_evidence_json", "no_lookahead_audit_json", "non_event_context_json",
        "features_snapshot", "top_feature_drivers", "lineage_json", "external_links_json",
        "narrative_summary", "readiness_score", "readiness_degrade_reasons", "reviewer_notes",
    }
    patch = {k: v for k, v in evidence.items() if k in allowed}
    return repo.update(candidate_id, patch)


def mark_needs_evidence(repo: CandidateRepository, candidate_id: str) -> dict[str, Any]:
    """Send a candidate back for more evidence. No gate — it is the 'not ready yet'
    move from draft or needs_review; the status machine validates the transition."""
    c = _require(repo, candidate_id)
    _assert_transition(c["approval_status"], NEEDS_EVIDENCE)
    return repo.update(candidate_id, {"approval_status": NEEDS_EVIDENCE})


def mark_needs_review(repo: CandidateRepository, candidate_id: str) -> dict[str, Any]:
    c = _require(repo, candidate_id)
    _assert_transition(c["approval_status"], NEEDS_REVIEW)
    blockers = evidence_blockers(c)
    if blockers:
        raise PromotionCandidateError(blockers)
    return repo.update(candidate_id, {"approval_status": NEEDS_REVIEW})


def approve_candidate(repo: CandidateRepository, candidate_id: str, *,
                      approval_actor: str, approval_timestamp: str,
                      coverage_override_reason: str | None = None) -> dict[str, Any]:
    c = _require(repo, candidate_id)
    _assert_transition(c["approval_status"], APPROVED)
    reasons = evidence_blockers(c)
    if not approval_actor:
        reasons.append("missing_approval_actor")
    cov = non_event_coverage(c)
    if cov["override_required"] and not (coverage_override_reason or cov.get("override_reason")):
        reasons.append("insufficient_non_event_coverage")
    if reasons:
        raise PromotionCandidateError(reasons)

    approved = {**c, "approval_status": APPROVED, "approval_actor": approval_actor,
                "approval_timestamp": approval_timestamp}
    if coverage_override_reason:  # make the override visible in the receipt
        ctx = {**(approved.get("non_event_context_json") or {}),
               "override_reason": coverage_override_reason}
        approved["non_event_context_json"] = ctx
    receipt = build_receipt(approved, generated_at=approval_timestamp)
    new_receipt_json = append_receipt(c.get("promotion_receipt_json"), receipt)
    patch = {"approval_status": APPROVED, "approval_actor": approval_actor,
             "approval_timestamp": approval_timestamp,
             "non_event_context_json": approved["non_event_context_json"],
             "promotion_receipt_json": new_receipt_json}
    return repo.update(candidate_id, patch)


def reject_candidate(repo: CandidateRepository, candidate_id: str, *,
                     rejection_reason: str) -> dict[str, Any]:
    c = _require(repo, candidate_id)
    _assert_transition(c["approval_status"], REJECTED)
    return repo.update(candidate_id, {"approval_status": REJECTED,
                                      "rejection_reason": rejection_reason})


def supersede_candidate(repo: CandidateRepository, candidate_id: str, *,
                        superseded_by_candidate_id: str) -> dict[str, Any]:
    c = _require(repo, candidate_id)
    _assert_transition(c["approval_status"], SUPERSEDED)
    return repo.update(candidate_id, {"approval_status": SUPERSEDED,
                                      "superseded_by_candidate_id": superseded_by_candidate_id})


def record_promoted_episode_link(repo: CandidateRepository, candidate_id: str, *,
                                 created_episode_id: str, promoted_at: str) -> dict[str, Any]:
    """Mark an APPROVED candidate as promoted and link the episode that ANOTHER
    ticket created. C4 does NOT create the episode or its embedding — it only
    records the link and seals the receipt. created_episode_id is required."""
    c = _require(repo, candidate_id)
    _assert_transition(c["approval_status"], PROMOTED)
    if not created_episode_id:
        raise PromotionCandidateError(["missing_created_episode_id"])
    promoted = {**c, "approval_status": PROMOTED, "created_episode_id": created_episode_id}
    receipt = build_receipt(promoted, generated_at=promoted_at)
    new_receipt_json = append_receipt(c.get("promotion_receipt_json"), receipt)
    return repo.update(candidate_id, {"approval_status": PROMOTED,
                                      "created_episode_id": created_episode_id,
                                      "promotion_receipt_json": new_receipt_json})


# --- helpers -----------------------------------------------------------------


def _require(repo: CandidateRepository, candidate_id: str) -> dict[str, Any]:
    c = repo.get(candidate_id)
    if c is None:
        raise PromotionCandidateError(["candidate_not_found"])
    return c


def _assert_transition(current: str, target: str) -> None:
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise PromotionCandidateError([f"invalid_status_transition:{current}->{target}"])


# --- live DB repository (fail-soft; storage only) ----------------------------

_JSONB = {"features_snapshot", "top_feature_drivers", "readiness_degrade_reasons",
          "lineage_json", "external_links_json", "calibration_evidence_json",
          "no_lookahead_audit_json", "non_event_context_json", "promotion_receipt_json"}


class DbCandidateRepository:
    """psycopg-backed store for hr_episode_promotion_candidates. Writes ONLY this
    table — never public.episodes / public.episode_embeddings. Fail-soft reads."""

    def insert(self, candidate: dict[str, Any]) -> dict[str, Any]:
        import json
        from app.db import get_cursor
        cols = [k for k in candidate if k != "id"]
        placeholders = ", ".join(f"%({c})s::jsonb" if c in _JSONB else f"%({c})s" for c in cols)
        params = {c: (json.dumps(candidate[c]) if c in _JSONB else candidate[c]) for c in cols}
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO hr_episode_promotion_candidates ({', '.join(cols)}) "
                f"VALUES ({placeholders}) RETURNING candidate_id",
                params,
            )
        return candidate

    def get(self, candidate_id: str) -> dict[str, Any] | None:
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                cur.execute("SELECT * FROM hr_episode_promotion_candidates WHERE candidate_id=%s",
                            (candidate_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception:
            return None

    def list(self, *, status: str | None = None, candidate_type: str | None = None) -> list[dict[str, Any]]:
        try:
            from app.db import get_cursor
            sql = "SELECT * FROM hr_episode_promotion_candidates WHERE 1=1"
            params: list[Any] = []
            if status:
                sql += " AND approval_status=%s"; params.append(status)
            if candidate_type:
                sql += " AND candidate_type=%s"; params.append(candidate_type)
            sql += " ORDER BY as_of_date DESC"
            with get_cursor() as cur:
                cur.execute(sql, params)
                return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []

    def update(self, candidate_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        import json
        from app.db import get_cursor
        sets = ", ".join(f"{k} = %({k})s::jsonb" if k in _JSONB else f"{k} = %({k})s" for k in patch)
        params = {k: (json.dumps(v) if k in _JSONB else v) for k, v in patch.items()}
        params["candidate_id"] = candidate_id
        with get_cursor() as cur:
            cur.execute(
                f"UPDATE hr_episode_promotion_candidates SET {sets}, updated_at = now() "
                f"WHERE candidate_id = %(candidate_id)s RETURNING candidate_id",
                params,
            )
        updated = self.get(candidate_id)
        return updated if updated is not None else {"candidate_id": candidate_id, **patch}
