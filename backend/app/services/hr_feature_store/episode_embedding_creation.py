"""C12 — explicit episode-embedding creation (makes a C10 episode searchable).

The step AFTER C10 episode creation and BEFORE the C13 seal: write exactly one
append-only `episode_embeddings` row (`embedding_type='full_state'`, vector(256),
`model_version`) for a real `episode_id` that the candidate produced. This is the
only step that makes the episode appear in `_search_analogs`.

Never automatic. Requires an approved candidate, an existing episode tied to that
candidate (via the C11 `origin_candidate_id`), a 256-dim vector, and explicit
confirmation at the route layer. Append-only — duplicates are skipped/blocked,
never overwritten. Does NOT seal the candidate (that is C13).
"""

from __future__ import annotations

from typing import Any, Protocol

from app.services.hr_feature_store.promotion_candidates import APPROVED

EMBEDDING_TYPE = "full_state"
FEATURE_VECTOR_DIM = 256


class EpisodeEmbeddingError(Exception):
    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__(", ".join(reasons))


class EpisodeEmbeddingRepository(Protocol):
    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None: ...
    def get_episode(self, episode_id: str) -> dict[str, Any] | None: ...
    def existing_embedding(self, episode_id: str, embedding_type: str,
                           model_version: str) -> bool: ...
    def insert_episode_embedding(self, row: dict[str, Any]) -> str: ...  # returns embedding id


def _resolve_vector(candidate: dict[str, Any], request_vector: list[float] | None) -> list[float] | None:
    """Prefer an explicit request vector; else the candidate's feature_vector."""
    if request_vector is not None:
        return request_vector
    return candidate.get("feature_vector")


def _blockers(candidate: dict[str, Any] | None, episode: dict[str, Any] | None, *,
              candidate_id: str, episode_id: str | None, vector: list[float] | None,
              model_version: str, duplicate: bool) -> list[str]:
    reasons: list[str] = []
    if candidate is None:
        return ["candidate_not_found"]
    if candidate.get("approval_status") != APPROVED:
        reasons.append("candidate_not_approved")
    if not episode_id:
        reasons.append("missing_episode_id")
        return reasons
    if episode is None:
        reasons.append("episode_not_found")
        return reasons
    # the episode must have been created from THIS candidate (C11 origin link)
    origin = episode.get("origin_candidate_id")
    if origin is not None and origin != candidate_id:
        reasons.append("episode_not_created_from_candidate")
    if origin is None and candidate.get("created_episode_id") not in (None, episode_id):
        reasons.append("episode_not_created_from_candidate")
    if not (isinstance(vector, list) and len(vector) == FEATURE_VECTOR_DIM):
        reasons.append("embedding_dimension_mismatch")
    if duplicate:
        reasons.append("episode_embedding_duplicate")
    return reasons


def plan_episode_embedding(repo: EpisodeEmbeddingRepository, candidate_id: str, *,
                           episode_id: str, model_version: str,
                           request_vector: list[float] | None = None) -> dict[str, Any]:
    """Dim/dedup/relationship plan. Writes nothing. Raises on block."""
    candidate = repo.get_candidate(candidate_id)
    episode = repo.get_episode(episode_id) if (candidate and episode_id) else None
    vector = _resolve_vector(candidate or {}, request_vector)
    duplicate = bool(episode_id) and repo.existing_embedding(episode_id, EMBEDDING_TYPE, model_version)
    reasons = _blockers(candidate, episode, candidate_id=candidate_id, episode_id=episode_id,
                        vector=vector, model_version=model_version, duplicate=duplicate)
    if reasons:
        raise EpisodeEmbeddingError(reasons)
    return {
        "status": "eligible", "candidate_id": candidate_id, "episode_id": episode_id,
        "embedding_type": EMBEDDING_TYPE, "model_version": model_version,
        "vector_dim": len(vector), "blocked_reasons": [],
    }


def create_episode_embedding(repo: EpisodeEmbeddingRepository, candidate_id: str, *,
                             episode_id: str, model_version: str,
                             request_vector: list[float] | None = None) -> dict[str, Any]:
    """Append-only write of one full_state episode_embeddings row → searchable.

    Does NOT seal the candidate. Raises on block; never overwrites an existing row."""
    plan_episode_embedding(repo, candidate_id, episode_id=episode_id,
                           model_version=model_version, request_vector=request_vector)
    candidate = repo.get_candidate(candidate_id)
    vector = _resolve_vector(candidate or {}, request_vector)
    row = {
        "episode_id": episode_id,
        "embedding_type": EMBEDDING_TYPE,
        "embedding": vector,
        "model_version": model_version,
        "feature_panel": (candidate or {}).get("features_normalized")
                         or (candidate or {}).get("features_snapshot") or {},
    }
    try:
        embedding_id = repo.insert_episode_embedding(row)
    except Exception as exc:  # noqa: BLE001
        raise EpisodeEmbeddingError(["episode_embedding_failed"]) from exc
    if embedding_id is None:  # ON CONFLICT DO NOTHING → already present
        raise EpisodeEmbeddingError(["episode_embedding_duplicate"])
    return {
        "status": "created",
        "candidate_id": candidate_id,
        "episode_id": episode_id,
        "embedding_id": embedding_id,
        "searchable": True,                 # the embedding now exists
        "embedding_status": "created",
        "next_required_step": "seal_promoted_candidate",
    }


# --- live DB repository (append-only; never seals, never touches candidate) ---


class DbEpisodeEmbeddingRepository:
    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None:
        from app.services.hr_feature_store.promotion_candidates import DbCandidateRepository
        return DbCandidateRepository().get(candidate_id)

    def get_episode(self, episode_id: str) -> dict[str, Any] | None:
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                cur.execute("SELECT id, origin_candidate_id FROM episodes WHERE id = %s", (episode_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception:
            # origin_candidate_id may not exist pre-C11; retry minimal
            try:
                from app.db import get_cursor
                with get_cursor() as cur:
                    cur.execute("SELECT id FROM episodes WHERE id = %s", (episode_id,))
                    row = cur.fetchone()
                    return dict(row) if row else None
            except Exception:
                return None

    def existing_embedding(self, episode_id: str, embedding_type: str, model_version: str) -> bool:
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

    def insert_episode_embedding(self, row: dict[str, Any]) -> str | None:
        import json

        from app.db import get_cursor
        vec = "[" + ",".join(str(float(x)) for x in row["embedding"]) + "]"
        with get_cursor() as cur:
            cur.execute(
                "INSERT INTO episode_embeddings (episode_id, embedding_type, embedding, model_version, feature_panel) "
                "VALUES (%s, %s, %s::vector, %s, %s::jsonb) "
                "ON CONFLICT (episode_id, embedding_type, model_version) DO NOTHING "
                "RETURNING id",
                (row["episode_id"], row["embedding_type"], vec, row["model_version"],
                 json.dumps(row.get("feature_panel") or {})),
            )
            r = cur.fetchone()
            return str(r["id"] if isinstance(r, dict) else r[0]) if r else None
