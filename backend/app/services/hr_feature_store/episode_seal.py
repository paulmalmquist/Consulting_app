"""C13 — seal a promoted episode candidate.

The FINAL step: after a real episode (C10) and its full_state embedding (C12)
exist, seal the candidate as promoted by calling the C4
`record_promoted_episode_link` — which sets status=promoted, created_episode_id,
and advances the immutable receipt. C13 adds NO new authority: it pre-checks the
episode + embedding exist (so we never seal a non-searchable promotion) and then
delegates the state change entirely to the C4 service.

No new episode write, no new embedding write. `promoted` is terminal.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.services.hr_feature_store import promotion_candidates as PC
from app.services.hr_feature_store.episode_embedding_creation import EMBEDDING_TYPE


class EpisodeSealError(Exception):
    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__(", ".join(reasons))


class EpisodeSealRepository(Protocol):
    # candidate ops delegate to the C4 CandidateRepository
    def get(self, candidate_id: str) -> dict[str, Any] | None: ...
    def update(self, candidate_id: str, patch: dict[str, Any]) -> dict[str, Any]: ...
    # episode + embedding existence checks
    def episode_exists(self, episode_id: str) -> bool: ...
    def embedding_exists(self, episode_id: str, embedding_type: str, model_version: str) -> bool: ...


def seal_promoted_episode(repo: EpisodeSealRepository, candidate_id: str, *,
                          episode_id: str, model_version: str, resolved_at: str) -> dict[str, Any]:
    """Validate episode+embedding exist, then delegate the seal to the C4 service.

    Raises EpisodeSealError on a pre-check block; lets C4 enforce the status
    machine (approved→promoted, created_episode_id required, promoted terminal)."""
    candidate = repo.get(candidate_id)
    if candidate is None:
        raise EpisodeSealError(["candidate_not_found"])

    reasons: list[str] = []
    status = candidate.get("approval_status")
    if status == PC.PROMOTED:
        reasons.append("candidate_already_promoted")
    elif status != PC.APPROVED:
        reasons.append("candidate_not_approved")
    if not episode_id:
        reasons.append("missing_episode_id")
    elif not repo.episode_exists(episode_id):
        reasons.append("episode_not_found")
    elif not repo.embedding_exists(episode_id, EMBEDDING_TYPE, model_version):
        # never seal a promotion whose episode isn't searchable
        reasons.append("episode_embedding_missing")
    if reasons:
        raise EpisodeSealError(reasons)

    # Delegate the actual state change + receipt advance to the C4 service.
    try:
        sealed = PC.record_promoted_episode_link(
            repo, candidate_id, created_episode_id=episode_id, promoted_at=resolved_at)
    except PC.PromotionCandidateError as e:
        raise EpisodeSealError(e.reasons) from e

    return {
        "status": "sealed",
        "candidate_id": candidate_id,
        "episode_id": episode_id,
        "approval_status": sealed.get("approval_status"),
        "created_episode_id": sealed.get("created_episode_id"),
        "receipt_version": (sealed.get("promotion_receipt_json") or {}).get("version"),
        "searchable": True,
    }


# --- live DB repository: C4 candidate store + episode/embedding existence ------


class DbEpisodeSealRepository:
    def __init__(self):
        from app.services.hr_feature_store.promotion_candidates import DbCandidateRepository
        self._candidates = DbCandidateRepository()

    def get(self, candidate_id: str) -> dict[str, Any] | None:
        return self._candidates.get(candidate_id)

    def update(self, candidate_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self._candidates.update(candidate_id, patch)

    def existing_model_versions(self):  # passthrough for any C4 internals
        return self._candidates.existing_model_versions()

    def episode_exists(self, episode_id: str) -> bool:
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                cur.execute("SELECT 1 FROM episodes WHERE id = %s", (episode_id,))
                return cur.fetchone() is not None
        except Exception:
            return False

    def embedding_exists(self, episode_id: str, embedding_type: str, model_version: str) -> bool:
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM episode_embeddings WHERE episode_id=%s AND embedding_type=%s AND model_version=%s",
                    (episode_id, embedding_type, model_version),
                )
                return cur.fetchone() is not None
        except Exception:
            return False
