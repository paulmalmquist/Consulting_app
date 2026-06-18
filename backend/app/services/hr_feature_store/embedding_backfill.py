"""C1 — gated episode_embeddings backfill PLANNER (dry-run first; no writes by default).

Promoting vetted `hr_history_rhymes_model_observations` rows into the live analog
spine (`episode_embeddings`) is a *gated promotion*, never a materializer side
effect. The default mode is `dry_run`; a write requires `--write --confirm`, valid
calibration evidence, the no-lookahead audit, a real `model_version` bump, an
append-only (non-overwrite) strategy, AND every per-row gate passing.

Schema reality (verified against `repo-b/db/schema/503_history_rhymes_structural.sql`):
`episode_embeddings` is keyed by `episode_id` (FK → `episodes`), NOT `observation_id`.
The gold model-observations carry no `episode_id`, so the live DB repository cannot
resolve a mapping → the planner BLOCKS on `episode_mapping_unresolved` and emits a
`mapping_proposal` for a C2 schema/adapter ticket. No schema change happens in C1.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.services.hr_feature_store import backfill_gates as G
from app.services.hr_feature_store.backfill_audit import audit_no_lookahead

EMBEDDING_TYPE = "full_state"

CANDIDATE_FIELDS = (
    "observation_id", "as_of_date", "model_obs_version", "features_normalized",
    "feature_vector", "text_embedding", "narrative_text", "source_quality",
    "is_crisis_anchor", "is_non_event", "model_readiness_score",
    "readiness_degrade_reasons", "lineage_json", "provenance",
)


class BackfillRepository(Protocol):
    """Abstraction over the gold source + the episode_embeddings target.

    Tests inject a fake; the live DB impl below is fail-soft and resolves no
    episode mapping (honest: the relationship does not exist yet)."""

    def list_candidates(self, limit: int | None = None) -> list[dict[str, Any]]: ...
    def existing_model_versions(self) -> set[str]: ...
    def existing_episode_keys(self, model_version: str, embedding_type: str = EMBEDDING_TYPE) -> set[str]: ...
    def resolve_episode_id(self, candidate: dict[str, Any]) -> str | None: ...
    def insert_episode_embeddings(self, rows: list[dict[str, Any]]) -> int: ...


# --------------------------------------------------------------------------- planning


def plan_backfill(
    repo: BackfillRepository,
    *,
    requested_model_version: str | None = None,
    calibration_evidence: dict[str, Any] | None = None,
    limit: int | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build a dry-run receipt and the full eligible insert rows (kept out of the
    receipt to keep it small). Returns (receipt, full_inserts). Never writes."""

    candidates = repo.list_candidates(limit)
    if not candidates:
        return _receipt(
            status="not_available",
            requested_model_version=requested_model_version,
            null_reason="no_model_observation_candidates",
        ), []

    existing_versions = repo.existing_model_versions()
    existing_keys = (
        repo.existing_episode_keys(requested_model_version) if requested_model_version else set()
    )

    # ---- batch-level gates (evidence + aggregate) ----
    brier = G.gate_brier(calibration_evidence)
    perm = G.gate_permutation(calibration_evidence)
    version = G.gate_model_version_bump(requested_model_version, existing_versions, calibration_evidence)

    batch_lookahead_ok = True
    blocked_reasons: list[str] = []
    planned_inserts: list[dict[str, Any]] = []
    full_inserts: list[dict[str, Any]] = []
    planned_skips: list[dict[str, Any]] = []
    mapping_gap = False

    # ---- per-row gates ----
    for c in candidates:
        ok_la, _ = audit_no_lookahead(c)
        if not ok_la:
            batch_lookahead_ok = False
        episode_id = repo.resolve_episode_id(c)
        duplicate = episode_id is not None and episode_id in existing_keys
        reasons = G.row_gate_failures(
            c, episode_id=episode_id, duplicate=duplicate, no_lookahead_ok=ok_la
        )
        if "episode_mapping_unresolved" in reasons:
            mapping_gap = True
        if reasons:
            planned_skips.append({"observation_id": c.get("observation_id"), "reasons": reasons})
            continue
        planned_inserts.append({
            "observation_id": c.get("observation_id"),
            "episode_id": episode_id,
            "embedding_type": EMBEDDING_TYPE,
            "model_version": requested_model_version,
            "vector_dim": len(c.get("feature_vector") or []),
        })
        full_inserts.append({
            "episode_id": episode_id,
            "embedding_type": EMBEDDING_TYPE,
            "embedding": c.get("feature_vector"),
            "model_version": requested_model_version,
            "feature_panel": c.get("features_normalized"),
            "observation_id": c.get("observation_id"),
        })

    no_lookahead = G.gate_no_lookahead({"passed": batch_lookahead_ok, "violations": [] if batch_lookahead_ok else [1]})
    coverage = G.gate_non_event_coverage(candidates)

    # ---- aggregate blocked reasons (no partial write) ----
    if brier["status"] == "missing":
        blocked_reasons.append("missing_calibration_evidence")
    elif brier["status"] == "fail":
        blocked_reasons.append("brier_too_high")
    if perm["status"] == "missing":
        blocked_reasons.append("missing_permutation_evidence")
    elif perm["status"] == "fail":
        blocked_reasons.append("permutation_not_significant")
    if no_lookahead["status"] == "fail":
        blocked_reasons.append("no_lookahead_violation")
    if version["status"] == "missing":
        blocked_reasons.append("model_version_not_specified")
    elif version["status"] == "fail":
        blocked_reasons.append("model_version_not_bumped")
    if coverage["status"] in ("degraded", "fail"):
        blocked_reasons.append("insufficient_non_event_coverage")
    if not planned_inserts:
        # surface the dominant per-row blockers so the receipt is self-explanatory
        seen = {r for s in planned_skips for r in s["reasons"]}
        for r in ("episode_mapping_unresolved", "source_quality_not_promotable",
                  "feature_vector_dim_mismatch", "lookahead_violation"):
            if r in seen:
                blocked_reasons.append(r)
        if not blocked_reasons:
            blocked_reasons.append("no_eligible_candidates")

    # de-dup, preserve order
    blocked_reasons = list(dict.fromkeys(blocked_reasons))
    eligible = not blocked_reasons and bool(planned_inserts)
    status = "eligible" if eligible else "blocked"

    receipt = _receipt(
        status=status,
        requested_model_version=requested_model_version,
        candidate_count=len(candidates),
        eligible_count=len(planned_inserts),
        blocked_count=len(planned_skips),
        blocked_reasons=blocked_reasons,
        gate_results={
            "brier_score": brier,
            "permutation_p_value": perm,
            "no_lookahead_audit": no_lookahead,
            "model_version_bump": version,
            "non_event_coverage": coverage,
        },
        planned_inserts=planned_inserts,
        planned_skips=planned_skips,
        evidence=_evidence_summary(calibration_evidence),
    )
    if mapping_gap:
        receipt["mapping_proposal"] = _mapping_proposal()
    return receipt, full_inserts


def _receipt(*, status: str, requested_model_version: str | None, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "mode": "dry_run",
        "status": status,
        "write_allowed": status == "eligible",
        "model_version": requested_model_version,
        "candidate_count": kw.get("candidate_count", 0),
        "eligible_count": kw.get("eligible_count", 0),
        "blocked_count": kw.get("blocked_count", 0),
        "blocked_reasons": kw.get("blocked_reasons", []),
        "gate_results": kw.get("gate_results", {}),
        "planned_inserts": kw.get("planned_inserts", []),
        "planned_skips": kw.get("planned_skips", []),
        "evidence": kw.get("evidence", []),
        "null_reason": kw.get("null_reason"),
    }
    return base


def _evidence_summary(ev: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not ev:
        return []
    return [{
        "source": ev.get("evidence_source"),
        "generated_at": ev.get("evidence_generated_at"),
        "model_version": ev.get("model_version"),
        "brier_score": ev.get("brier_score"),
        "permutation_p_value": ev.get("permutation_p_value"),
        "no_lookahead_passed": ev.get("no_lookahead_passed"),
    }]


def _mapping_proposal() -> dict[str, Any]:
    return {
        "issue": "episode_embeddings is keyed by episode_id (FK -> episodes); "
                 "hr_history_rhymes_model_observations carries observation_id/as_of_date, no episode_id.",
        "blocked_reason": "episode_mapping_unresolved",
        "options": [
            "C2-A: add a deterministic observation->episode mapping (resolve as_of_date/anchor_name "
            "to episodes.id) as a read-only adapter; no schema change.",
            "C2-B: add a feature-store-specific embedding table keyed by (observation_id, model_version) "
            "with its own HNSW index, leaving episode_embeddings untouched.",
        ],
        "decision_required": "Update the active plan and open a C2 ticket before any schema/adapter work.",
    }


# --------------------------------------------------------------------------- execution


def execute_backfill(
    repo: BackfillRepository,
    receipt: dict[str, Any],
    full_inserts: list[dict[str, Any]],
    *,
    write: bool,
    confirm: bool,
) -> dict[str, Any]:
    """The ONLY write path. Append-only; never deletes or updates in place.

    Gated behind --write AND --confirm AND a fully eligible plan. Anything short
    of that is a no-op with an explicit reason."""
    if not write:
        return {"write_performed": False, "written": 0, "reason": "dry_run_default"}
    if not confirm:
        return {"write_performed": False, "written": 0, "reason": "confirm_required"}
    if receipt.get("status") != "eligible" or not receipt.get("write_allowed"):
        return {"write_performed": False, "written": 0, "reason": "gates_not_passed"}
    written = repo.insert_episode_embeddings(full_inserts)  # append-only by model_version
    return {"write_performed": True, "written": written, "reason": "ok"}


# --------------------------------------------------------------------------- live DB repo (fail-soft)


class DbBackfillRepository:
    """Live repository. Fail-soft on a missing DB; resolves NO episode mapping
    (honest — the relationship does not exist). Reads only; the write path is
    append-only ON CONFLICT DO NOTHING and never reached via DB until a C2
    mapping adapter exists."""

    def list_candidates(self, limit: int | None = None) -> list[dict[str, Any]]:
        try:
            from app.db import get_cursor  # lazy: tests patch app.db.get_cursor
        except Exception:
            return []
        sql = (
            "SELECT observation_id, as_of_date, model_obs_version, features_normalized, "
            "feature_vector, text_embedding, narrative_text, source_quality, is_crisis_anchor, "
            "is_non_event, model_readiness_score, readiness_degrade_reasons, lineage_json, provenance "
            "FROM hr_history_rhymes_model_observations ORDER BY as_of_date DESC"
        )
        if limit:
            sql += f" LIMIT {int(limit)}"
        try:
            with get_cursor() as cur:
                cur.execute(sql)
                rows = [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        for r in rows:
            r["feature_vector"] = _parse_vector(r.get("feature_vector"))
        return rows

    def existing_model_versions(self) -> set[str]:
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                cur.execute("SELECT DISTINCT model_version FROM episode_embeddings")
                return {row[0] for row in cur.fetchall() if row and row[0]}
        except Exception:
            return set()

    def existing_episode_keys(self, model_version: str, embedding_type: str = EMBEDDING_TYPE) -> set[str]:
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                cur.execute(
                    "SELECT episode_id FROM episode_embeddings WHERE model_version=%s AND embedding_type=%s",
                    (model_version, embedding_type),
                )
                return {str(row[0]) for row in cur.fetchall() if row and row[0]}
        except Exception:
            return set()

    def resolve_episode_id(self, candidate: dict[str, Any]) -> str | None:
        # No observation->episode mapping exists in the schema. Do NOT hack one.
        return None

    def insert_episode_embeddings(self, rows: list[dict[str, Any]]) -> int:
        from app.db import get_cursor
        inserted = 0
        with get_cursor() as cur:
            for r in rows:
                vec = "[" + ",".join(str(float(x)) for x in r["embedding"]) + "]"
                cur.execute(
                    "INSERT INTO episode_embeddings (episode_id, embedding_type, embedding, model_version, feature_panel) "
                    "VALUES (%s, %s, %s::vector, %s, %s::jsonb) "
                    "ON CONFLICT (episode_id, embedding_type, model_version) DO NOTHING "
                    "RETURNING id",
                    (r["episode_id"], r["embedding_type"], vec, r["model_version"],
                     __import__("json").dumps(r.get("feature_panel") or {})),
                )
                if cur.fetchone():
                    inserted += 1
        return inserted


def _parse_vector(v: Any) -> Any:
    if isinstance(v, str):
        try:
            return [float(x) for x in v.strip("[]").split(",") if x.strip()]
        except Exception:
            return None
    return v
