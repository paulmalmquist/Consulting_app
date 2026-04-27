"""pitch_forge.py — Pitch Forge DB service.

All DB operations for the Pitch Forge pipeline. This module owns reads and
writes for all pf_* tables. AI orchestration lives in pitch_forge_ai.py.

Rules:
- Synchronous DB via get_cursor()
- Return dicts (not ORM models)
- Raise PitchForgeError subclasses for domain failures
- Hard-enforce max 3 iterations at this layer
"""
from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor


# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------

class PitchForgeError(Exception):
    """Base class for Pitch Forge domain errors."""


class PitchForgeNotFound(PitchForgeError):
    """Requested object does not exist."""


class PitchForgeMaxIterationsError(PitchForgeError):
    """Project has reached the maximum of 3 iterations."""


class PitchForgePreconditionError(PitchForgeError):
    """Operation cannot proceed given the current project state."""


# ---------------------------------------------------------------------------
# pf_project
# ---------------------------------------------------------------------------

def get_project(*, env_id: str, business_id: UUID, project_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_project
               WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid""",
            (str(project_id), env_id, str(business_id)),
        )
        row = cur.fetchone()
    if not row:
        raise PitchForgeNotFound(f"Project {project_id} not found")
    return row


def get_project_by_slug(*, env_id: str, business_id: UUID, client_slug: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_project
               WHERE env_id = %s AND business_id = %s::uuid AND client_slug = %s""",
            (env_id, str(business_id), client_slug),
        )
        return cur.fetchone()


def list_projects(*, env_id: str, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_project
               WHERE env_id = %s AND business_id = %s::uuid
               ORDER BY updated_at DESC""",
            (env_id, str(business_id)),
        )
        return cur.fetchall()


def create_project(*, env_id: str, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO pf_project
               (env_id, business_id, client_name, client_slug, notes)
               VALUES (%s, %s::uuid, %s, %s, %s)
               RETURNING *""",
            (
                env_id,
                str(business_id),
                payload["client_name"],
                payload["client_slug"],
                payload.get("notes"),
            ),
        )
        return cur.fetchone()


def update_project_status(
    *,
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    status: str,
    current_score: int | None = None,
    fail_reason: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE pf_project
               SET status = %s,
                   current_score = COALESCE(%s, current_score),
                   fail_reason = COALESCE(%s, fail_reason),
                   updated_at = now()
               WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               RETURNING *""",
            (status, current_score, fail_reason, str(project_id), env_id, str(business_id)),
        )
        return cur.fetchone()


def increment_iteration_count(*, env_id: str, business_id: UUID, project_id: UUID) -> dict:
    """Increment iteration_count. Raises PitchForgeMaxIterationsError if already at 3."""
    proj = get_project(env_id=env_id, business_id=business_id, project_id=project_id)
    if proj["iteration_count"] >= 3:
        raise PitchForgeMaxIterationsError(
            f"Project {project_id} has reached the maximum of 3 iterations. "
            "Cannot continue without resolving fatal issues identified in the last red team review."
        )
    with get_cursor() as cur:
        cur.execute(
            """UPDATE pf_project
               SET iteration_count = iteration_count + 1, updated_at = now()
               WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               RETURNING *""",
            (str(project_id), env_id, str(business_id)),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# pf_source
# ---------------------------------------------------------------------------

def list_sources(*, env_id: str, business_id: UUID, project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_source
               WHERE project_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               ORDER BY created_at ASC""",
            (str(project_id), env_id, str(business_id)),
        )
        return cur.fetchall()


def add_source(*, env_id: str, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO pf_source
               (env_id, business_id, project_id, source_type, label, content, url, confidence)
               VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                env_id, str(business_id), str(project_id),
                payload["source_type"],
                payload["label"],
                payload["content"],
                payload.get("url"),
                payload.get("confidence", "medium"),
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# pf_claim
# ---------------------------------------------------------------------------

def list_claims(
    *,
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    category: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        if category:
            cur.execute(
                """SELECT * FROM pf_claim
                   WHERE project_id = %s::uuid AND env_id = %s
                     AND business_id = %s::uuid AND claim_category = %s
                   ORDER BY created_at ASC""",
                (str(project_id), env_id, str(business_id), category),
            )
        else:
            cur.execute(
                """SELECT * FROM pf_claim
                   WHERE project_id = %s::uuid AND env_id = %s
                     AND business_id = %s::uuid
                   ORDER BY claim_category, created_at ASC""",
                (str(project_id), env_id, str(business_id)),
            )
        return cur.fetchall()


def add_claim(*, env_id: str, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO pf_claim
               (env_id, business_id, project_id, source_id, claim_text,
                claim_category, is_available, unavailable_reason)
               VALUES (%s, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)
               RETURNING *""",
            (
                env_id, str(business_id), str(project_id),
                payload.get("source_id"),
                payload["claim_text"],
                payload["claim_category"],
                payload.get("is_available", True),
                payload.get("unavailable_reason"),
            ),
        )
        return cur.fetchone()


def bulk_insert_claims(
    *,
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    claims: list[dict],
) -> list[dict]:
    """Insert multiple claims in a single transaction. Used after AI synthesis."""
    inserted = []
    with get_cursor() as cur:
        for c in claims:
            cur.execute(
                """INSERT INTO pf_claim
                   (env_id, business_id, project_id, source_id, claim_text,
                    claim_category, is_available, unavailable_reason)
                   VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
                   RETURNING *""",
                (
                    env_id, str(business_id), str(project_id),
                    c.get("source_id"),
                    c["claim_text"],
                    c["claim_category"],
                    c.get("is_available", True),
                    c.get("unavailable_reason"),
                ),
            )
            inserted.append(cur.fetchone())
    return inserted


# ---------------------------------------------------------------------------
# pf_iteration
# ---------------------------------------------------------------------------

def list_iterations(*, env_id: str, business_id: UUID, project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_iteration
               WHERE project_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               ORDER BY iteration_num ASC""",
            (str(project_id), env_id, str(business_id)),
        )
        return cur.fetchall()


def get_iteration(*, env_id: str, business_id: UUID, iteration_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_iteration
               WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid""",
            (str(iteration_id), env_id, str(business_id)),
        )
        row = cur.fetchone()
    if not row:
        raise PitchForgeNotFound(f"Iteration {iteration_id} not found")
    return row


def create_iteration(*, env_id: str, business_id: UUID, project_id: UUID, iteration_num: int) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO pf_iteration
               (env_id, business_id, project_id, iteration_num)
               VALUES (%s, %s::uuid, %s::uuid, %s)
               RETURNING *""",
            (env_id, str(business_id), str(project_id), iteration_num),
        )
        return cur.fetchone()


def update_iteration(
    *,
    env_id: str,
    business_id: UUID,
    iteration_id: UUID,
    status: str | None = None,
    score: int | None = None,
    score_breakdown: dict | None = None,
    raw_proposal: str | None = None,
    rebuilt_proposal: str | None = None,
) -> dict:
    sets = ["updated_at = now()"]
    params: list = []
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    if score is not None:
        sets.append("score = %s")
        params.append(score)
    if score_breakdown is not None:
        sets.append("score_breakdown = %s")
        params.append(json.dumps(score_breakdown))
    if raw_proposal is not None:
        sets.append("raw_proposal = %s")
        params.append(raw_proposal)
    if rebuilt_proposal is not None:
        sets.append("rebuilt_proposal = %s")
        params.append(rebuilt_proposal)
    params += [str(iteration_id), env_id, str(business_id)]
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE pf_iteration SET {', '.join(sets)} "
            "WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid RETURNING *",
            params,
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# pf_use_case
# ---------------------------------------------------------------------------

def list_use_cases(
    *,
    env_id: str,
    business_id: UUID,
    iteration_id: UUID,
    include_killed: bool = False,
) -> list[dict]:
    with get_cursor() as cur:
        if include_killed:
            cur.execute(
                """SELECT * FROM pf_use_case
                   WHERE iteration_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
                   ORDER BY created_at ASC""",
                (str(iteration_id), env_id, str(business_id)),
            )
        else:
            cur.execute(
                """SELECT * FROM pf_use_case
                   WHERE iteration_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
                     AND status != 'killed'
                   ORDER BY created_at ASC""",
                (str(iteration_id), env_id, str(business_id)),
            )
        return cur.fetchall()


def bulk_insert_use_cases(
    *,
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    iteration_id: UUID,
    use_cases: list[dict],
) -> list[dict]:
    inserted = []
    with get_cursor() as cur:
        for uc in use_cases:
            cur.execute(
                """INSERT INTO pf_use_case
                   (env_id, business_id, project_id, iteration_id, workflow_name,
                    current_pain, proposed_intervention, who_uses_it, change_tomorrow,
                    estimated_impact, impact_confidence, dependencies, novendor_credibility)
                   VALUES (%s, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING *""",
                (
                    env_id, str(business_id), str(project_id), str(iteration_id),
                    uc["workflow_name"],
                    uc["current_pain"],
                    uc["proposed_intervention"],
                    uc["who_uses_it"],
                    uc["change_tomorrow"],
                    uc["estimated_impact"],
                    uc.get("impact_confidence", "medium"),
                    uc.get("dependencies"),
                    uc.get("novendor_credibility", ""),
                ),
            )
            inserted.append(cur.fetchone())
    return inserted


def update_use_case_status(
    *,
    env_id: str,
    business_id: UUID,
    use_case_id: UUID,
    status: str,
    kill_reason: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE pf_use_case
               SET status = %s, kill_reason = COALESCE(%s, kill_reason)
               WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               RETURNING *""",
            (status, kill_reason, str(use_case_id), env_id, str(business_id)),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# pf_red_team_review
# ---------------------------------------------------------------------------

def create_red_team_review(
    *,
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    iteration_id: UUID,
    review: dict,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO pf_red_team_review
               (env_id, business_id, project_id, iteration_id, score, score_breakdown,
                kill_list, weak_spots, missing_evidence, research_refill,
                fatal_issues, fixable_issues, acceptable_weaknesses, missing_inputs,
                verdict, verdict_reason)
               VALUES (%s, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                env_id, str(business_id), str(project_id), str(iteration_id),
                review["score"],
                json.dumps(review.get("score_breakdown", {})),
                json.dumps(review.get("kill_list", [])),
                json.dumps(review.get("weak_spots", [])),
                json.dumps(review.get("missing_evidence", [])),
                json.dumps(review.get("research_refill", [])),
                json.dumps(review.get("fatal_issues", [])),
                json.dumps(review.get("fixable_issues", [])),
                json.dumps(review.get("acceptable_weaknesses", [])),
                json.dumps(review.get("missing_inputs", [])),
                review["verdict"],
                review["verdict_reason"],
            ),
        )
        return cur.fetchone()


def get_latest_red_team_review(
    *, env_id: str, business_id: UUID, project_id: UUID
) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_red_team_review
               WHERE project_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               ORDER BY created_at DESC
               LIMIT 1""",
            (str(project_id), env_id, str(business_id)),
        )
        return cur.fetchone()


def get_red_team_review_for_iteration(
    *, env_id: str, business_id: UUID, iteration_id: UUID
) -> dict | None:
    """Return the red team review for a specific iteration (by iteration_id)."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_red_team_review
               WHERE iteration_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               LIMIT 1""",
            (str(iteration_id), env_id, str(business_id)),
        )
        return cur.fetchone()


def list_red_team_reviews(*, env_id: str, business_id: UUID, project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_red_team_review
               WHERE project_id = %s::uuid AND env_id = %s AND business_id = %s::uuid
               ORDER BY created_at ASC""",
            (str(project_id), env_id, str(business_id)),
        )
        return cur.fetchall()


# ---------------------------------------------------------------------------
# pf_final_output
# ---------------------------------------------------------------------------

def create_final_output(
    *,
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    iteration_id: UUID,
    content: str,
    score: int,
    use_case_count: int,
    format: str = "bullet_email",
) -> dict:
    with get_cursor() as cur:
        # INSERT OR REPLACE: overwrite if re-running a passed project
        cur.execute(
            """INSERT INTO pf_final_output
               (env_id, business_id, project_id, iteration_id, format, content, score, use_case_count)
               VALUES (%s, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)
               ON CONFLICT (project_id) DO UPDATE SET
                 iteration_id = EXCLUDED.iteration_id,
                 content = EXCLUDED.content,
                 score = EXCLUDED.score,
                 use_case_count = EXCLUDED.use_case_count,
                 created_at = now()
               RETURNING *""",
            (
                env_id, str(business_id), str(project_id), str(iteration_id),
                format, content, score, use_case_count,
            ),
        )
        return cur.fetchone()


def get_final_output(*, env_id: str, business_id: UUID, project_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM pf_final_output
               WHERE project_id = %s::uuid AND env_id = %s AND business_id = %s::uuid""",
            (str(project_id), env_id, str(business_id)),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Dashboard / summary
# ---------------------------------------------------------------------------

def get_project_summary(*, env_id: str, business_id: UUID, project_id: UUID) -> dict:
    """Returns a complete summary of a project: project + sources + claims + iterations."""
    proj = get_project(env_id=env_id, business_id=business_id, project_id=project_id)
    sources = list_sources(env_id=env_id, business_id=business_id, project_id=project_id)
    claims = list_claims(env_id=env_id, business_id=business_id, project_id=project_id)
    iterations = list_iterations(env_id=env_id, business_id=business_id, project_id=project_id)
    reviews = list_red_team_reviews(env_id=env_id, business_id=business_id, project_id=project_id)
    final = get_final_output(env_id=env_id, business_id=business_id, project_id=project_id)

    # For each iteration, attach its use cases and review
    iteration_details = []
    for it in iterations:
        uc_rows = list_use_cases(
            env_id=env_id,
            business_id=business_id,
            iteration_id=it["id"],
            include_killed=True,
        )
        review = next((r for r in reviews if str(r["iteration_id"]) == str(it["id"])), None)
        iteration_details.append({**it, "use_cases": uc_rows, "red_team_review": review})

    gaps = [c for c in claims if not c["is_available"]]

    return {
        "project": proj,
        "sources": sources,
        "claims": claims,
        "gaps": gaps,
        "iterations": iteration_details,
        "final_output": final,
    }
