"""pitch_forge.py — Pitch Forge API routes.

Bounded proposal pipeline: research → generate → red team → rebuild → final output.
Max 3 iterations per project. Fails loudly if still below threshold after 3 passes.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.pitch_forge import (
    PfContextOut,
    ProjectCreateIn,
    SourceCreateIn,
    ClaimCreateIn,
    FinalOutputFormatIn,
    ResearchSynthesisIn,
    GenerateDeckIn,
)
from app.services import env_context
from app.services import pitch_forge as pf_db
from app.services import pitch_forge_ai as pf_ai
from app.services.pitch_forge import (
    PitchForgeNotFound,
    PitchForgeMaxIterationsError,
    PitchForgePreconditionError,
)

router = APIRouter(prefix="/api/pitch-forge/v1", tags=["pitch-forge"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="pitch_forge",
    )
    return ctx.env_id, UUID(ctx.business_id), ctx


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

@router.get("/context", response_model=PfContextOut)
def get_context(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return PfContextOut(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.context.failed",
        )


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@router.get("/projects")
def list_projects(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        projects = pf_db.list_projects(env_id=resolved_env_id, business_id=resolved_business_id)
        return {"projects": projects}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.projects.list.failed",
        )


@router.post("/projects")
def create_project(
    payload: ProjectCreateIn,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.create_project(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=payload.dict(),
        )
        return {"project": project}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.project.create.failed",
        )


@router.get("/projects/{project_id}/summary")
def get_project_summary(
    project_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        summary = pf_db.get_project_summary(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
        return summary
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.project.summary.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.project.summary.failed",
        )


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/sources")
def list_sources(
    project_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        sources = pf_db.list_sources(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        return {"sources": sources}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.sources.list.failed",
        )


@router.post("/projects/{project_id}/sources")
def add_source(
    project_id: UUID,
    payload: SourceCreateIn,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        source = pf_db.add_source(
            env_id=resolved_env_id, business_id=resolved_business_id,
            project_id=project_id, payload=payload.dict(),
        )
        return {"source": source}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.source.add.failed",
        )


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/claims")
def list_claims(
    project_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    category: str | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        claims = pf_db.list_claims(
            env_id=resolved_env_id, business_id=resolved_business_id,
            project_id=project_id, category=category,
        )
        return {"claims": claims}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.claims.list.failed",
        )


@router.post("/projects/{project_id}/claims")
def add_claim(
    project_id: UUID,
    payload: ClaimCreateIn,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        claim = pf_db.add_claim(
            env_id=resolved_env_id, business_id=resolved_business_id,
            project_id=project_id, payload=payload.dict(),
        )
        return {"claim": claim}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.claim.add.failed",
        )


# ---------------------------------------------------------------------------
# AI: Synthesize research into claims
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/synthesize-research")
def synthesize_research(
    project_id: UUID,
    payload: ResearchSynthesisIn,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """
    Runs AI research synthesis and bulk-inserts structured claims.
    Used to ingest raw research (e.g. deep_research report) into the claim store.
    """
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.get_project(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )

        result = pf_ai.synthesize_research(
            client_name=project["client_name"],
            raw_research=payload.raw_research,
            known_constraints=payload.known_constraints,
        )

        # Bulk insert claims from synthesis result
        claims_to_insert = []
        for f in result.get("facts", []):
            claims_to_insert.append({
                "claim_text": f["text"],
                "claim_category": "fact",
                "is_available": True,
            })
        for c in result.get("constraints", []):
            claims_to_insert.append({
                "claim_text": c["text"],
                "claim_category": "constraint",
                "is_available": True,
            })
        for i in result.get("inferences", []):
            claims_to_insert.append({
                "claim_text": f"[INFERENCE] {i['text']}",
                "claim_category": "inference",
                "is_available": True,
            })
        for g in result.get("gaps", []):
            claims_to_insert.append({
                "claim_text": g["text"],
                "claim_category": "gap",
                "is_available": False,
                "unavailable_reason": g.get("unavailable_reason", g.get("why_it_matters", "Not confirmed")),
            })
        for r in result.get("risks", []):
            claims_to_insert.append({
                "claim_text": r["text"],
                "claim_category": "risk",
                "is_available": True,
            })

        inserted = pf_db.bulk_insert_claims(
            env_id=resolved_env_id, business_id=resolved_business_id,
            project_id=project_id, claims=claims_to_insert,
        )

        pf_db.update_project_status(
            env_id=resolved_env_id, business_id=resolved_business_id,
            project_id=project_id, status="drafting",
        )

        return {
            "claims_inserted": len(inserted),
            "synthesis": result,
            "message": f"Synthesized {len(inserted)} claims from research. Ready to generate proposal.",
        }
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.synthesize.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="pitch_forge.synthesis_error",
            detail=str(exc), action="pitch-forge.synthesize.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.synthesize.failed",
        )


# ---------------------------------------------------------------------------
# AI: Generate proposal (build step)
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/generate")
def generate_proposal(
    project_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """
    Generates use cases for the next iteration.
    Enforces max 3 iterations. Raises 429 if limit reached.
    """
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.get_project(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )

        result = pf_ai.run_proposal_generation_step(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            client_name=project["client_name"],
        )

        return {
            "iteration": result["iteration"],
            "use_cases": result["use_cases"],
            "message": f"Generated {len(result['use_cases'])} use cases for iteration {result['iteration']['iteration_num']}.",
        }
    except PitchForgeMaxIterationsError as exc:
        return domain_error_response(
            request=request, status_code=429, code="pitch_forge.max_iterations",
            detail=str(exc), action="pitch-forge.generate.failed",
        )
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.generate.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="pitch_forge.generation_error",
            detail=str(exc), action="pitch-forge.generate.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.generate.failed",
        )


# ---------------------------------------------------------------------------
# AI: Run red team
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/iterations/{iteration_id}/red-team")
def run_red_team(
    project_id: UUID,
    iteration_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    critique_mode: str = Query(default="standard"),  # standard | sarat
):
    """
    Runs red team critique on the specified iteration.

    ?critique_mode=standard  (default) — 4-verdict scoring loop (pass/rebuild/research_refill/fail)
    ?critique_mode=sarat     — CFO/CIO persona critique with PASS/WEAK/REJECT per section,
                               objection_scores, and sarat_voice_summary
    """
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.get_project(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )

        if critique_mode == "sarat":
            # Load the iteration's raw_proposal for Sarat to critique
            iteration = pf_db.get_iteration(
                env_id=resolved_env_id, business_id=resolved_business_id,
                iteration_id=iteration_id,
            )
            presentation_content = iteration.get("raw_proposal") or ""
            if not presentation_content:
                # Fall back to assembling use cases as text
                use_cases = pf_db.list_use_cases(
                    env_id=resolved_env_id, business_id=resolved_business_id,
                    iteration_id=iteration_id, include_killed=False,
                )
                presentation_content = pf_ai._use_cases_to_text([dict(uc) for uc in use_cases])

            claims = pf_db.list_claims(
                env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
            )
            constraints = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "constraint"]

            review = pf_ai.run_sarat_red_team(
                client_name=project["client_name"],
                presentation_content=presentation_content,
                iteration_num=project["iteration_count"],
                max_iterations=3,
                known_constraints=constraints,
            )

            return {
                "review": review,
                "critique_mode": "sarat",
                "overall_verdict": review["overall_verdict"],
                "section_verdicts": review.get("section_verdicts", {}),
                "objection_scores": review.get("objection_scores", {}),
                "sarat_voice_summary": review.get("sarat_voice_summary", ""),
                "score": review["score"],
                "message": _sarat_verdict_message(review["overall_verdict"], review["score"]),
            }

        # Standard red team (default)
        result = pf_ai.run_red_team_step(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            iteration_id=iteration_id,
            client_name=project["client_name"],
        )

        return {
            "review": result["review"],
            "verdict": result["verdict"],
            "score": result["score"],
            "critique_mode": "standard",
            "message": _verdict_message(result["verdict"], result["score"], project["iteration_count"]),
        }
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.red-team.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="pitch_forge.red_team_error",
            detail=str(exc), action="pitch-forge.red-team.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.red-team.failed",
        )


def _verdict_message(verdict: str, score: int, iteration_count: int) -> str:
    if verdict == "pass":
        return f"Score {score}/100 — proposal passes. Ready to generate final output."
    if verdict == "rebuild":
        return f"Score {score}/100 — fixable issues found. Rebuild required. ({iteration_count}/3 iterations used)"
    if verdict == "research_refill":
        return f"Score {score}/100 — missing evidence blocks progress. Research refill required before rebuild."
    return (
        f"FAILED after {iteration_count} iterations with score {score}/100. "
        "Review the red team feedback for required inputs. The project cannot proceed without new research."
    )


def _sarat_verdict_message(overall_verdict: str, score: int) -> str:
    if overall_verdict == "PASS":
        return f"Score {score}/100 — Sarat approves. Proposal survives the CFO/CIO filter."
    if overall_verdict == "WEAK":
        return f"Score {score}/100 — Sarat has reservations. Review objection scores and address WEAK sections before presenting."
    return (
        f"Score {score}/100 — Sarat rejects this. Review the kill list and fatal issues. "
        "Do not present until REJECT sections are rebuilt."
    )


# ---------------------------------------------------------------------------
# AI: Generate presentation deck
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/generate-deck")
def generate_deck(
    project_id: UUID,
    payload: GenerateDeckIn,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """
    Generates a 12-slide PowerPoint-style markdown presentation.
    If iteration_id is provided, pulls the prior Sarat critique and feeds it
    into the generation prompt so the deck is already hardened against known objections.

    Output is markdown. Use with the CLI orchestrator to write to
    demo_docs/hall_boys/pitch_forge/iteration_N/presentation.md
    """
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.get_project(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )

        claims = pf_db.list_claims(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        facts = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "fact"]
        constraints = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "constraint"]
        inferences = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "inference"]
        gaps = [{"text": c["claim_text"], "why_it_matters": c.get("unavailable_reason", "unknown")}
                for c in claims if not c["is_available"]]

        # Pull prior Sarat critique if iteration_id given
        previous_critique = None
        if payload.iteration_id:
            try:
                review = pf_db.get_red_team_review_for_iteration(
                    env_id=resolved_env_id, business_id=resolved_business_id,
                    iteration_id=payload.iteration_id,
                )
                if review:
                    previous_critique = dict(review)
            except Exception:
                pass  # No prior critique — generate fresh

        content = pf_ai.generate_presentation_deck(
            client_name=project["client_name"],
            topic=payload.topic,
            facts=facts,
            constraints=constraints,
            inferences=inferences,
            gaps=gaps,
            iteration_num=project["iteration_count"],
            previous_critique=previous_critique,
        )

        return {
            "content": content,
            "iteration_num": project["iteration_count"],
            "client_name": project["client_name"],
            "message": f"Generated 12-slide deck for iteration {project['iteration_count']}. Topic: {payload.topic}",
        }
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.generate-deck.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="pitch_forge.deck_error",
            detail=str(exc), action="pitch-forge.generate-deck.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.generate-deck.failed",
        )


# ---------------------------------------------------------------------------
# AI: Resolve research gaps
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/resolve-gaps")
def resolve_gaps(
    project_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """
    Runs AI research gap resolution. Use after a research_refill verdict.
    """
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.get_project(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        claims = pf_db.list_claims(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        gaps = [
            {"text": c["claim_text"], "why_it_matters": c.get("unavailable_reason", "unknown")}
            for c in claims if not c["is_available"]
        ]
        review = pf_db.get_latest_red_team_review(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        missing = []
        if review:
            missing = review.get("research_refill", []) or []
        sources = pf_db.list_sources(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        source_labels = [s["label"] for s in sources]

        result = pf_ai.resolve_research_gaps(
            client_name=project["client_name"],
            gaps=gaps,
            missing_from_red_team=missing,
            existing_sources=source_labels,
        )

        # Insert newly resolved gaps as facts
        for rg in result.get("resolved_gaps", []):
            if rg.get("confidence") in ("high", "medium"):
                pf_db.add_claim(
                    env_id=resolved_env_id, business_id=resolved_business_id,
                    project_id=project_id,
                    payload={
                        "claim_text": f"[RESOLVED] {rg['original_gap']}: {rg['resolution']}",
                        "claim_category": "fact",
                        "is_available": True,
                    },
                )

        return {
            "resolved": result.get("resolved_gaps", []),
            "unresolved": result.get("unresolved_gaps", []),
            "message": (
                f"Resolved {len(result.get('resolved_gaps', []))} gaps. "
                f"{len(result.get('unresolved_gaps', []))} require direct client input."
            ),
        }
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.resolve-gaps.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.resolve-gaps.failed",
        )


# ---------------------------------------------------------------------------
# AI: Generate final output
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/final-output")
def generate_final_output(
    project_id: UUID,
    payload: FinalOutputFormatIn,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """
    Generates client-ready output. Only succeeds if project status is 'passed'.
    Raises 422 if project has not passed.
    """
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        project = pf_db.get_project(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )

        if project["status"] != "passed":
            raise PitchForgePreconditionError(
                f"Project status is '{project['status']}'. "
                "Final output can only be generated after the project reaches 'passed' status (score >= 80)."
            )

        iterations = pf_db.list_iterations(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        if not iterations:
            raise PitchForgePreconditionError("No iterations found for this project.")

        latest = iterations[-1]
        use_cases = pf_db.list_use_cases(
            env_id=resolved_env_id, business_id=resolved_business_id,
            iteration_id=latest["id"], include_killed=False,
        )

        content = pf_ai.generate_final_output(
            client_name=project["client_name"],
            use_cases=[dict(uc) for uc in use_cases],
            score=project["current_score"] or 80,
            format=payload.format,
        )

        stored = pf_db.create_final_output(
            env_id=resolved_env_id, business_id=resolved_business_id,
            project_id=project_id, iteration_id=latest["id"],
            content=content, score=project["current_score"] or 80,
            use_case_count=len(use_cases), format=payload.format,
        )

        return {"output": stored, "message": "Final output generated. Ready to copy into email, deck, or talking points."}

    except PitchForgePreconditionError as exc:
        return domain_error_response(
            request=request, status_code=422, code="pitch_forge.precondition_failed",
            detail=str(exc), action="pitch-forge.final-output.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="pitch_forge.output_validation_failed",
            detail=str(exc), action="pitch-forge.final-output.failed",
        )
    except PitchForgeNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="pitch_forge.not_found",
            detail=str(exc), action="pitch-forge.final-output.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.final-output.failed",
        )


@router.get("/projects/{project_id}/final-output")
def get_final_output(
    project_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ = _resolve_context(request, env_id, business_id)
        output = pf_db.get_final_output(
            env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id
        )
        if not output:
            return {"output": None, "message": "No final output yet. Run /generate then /red-team until score >= 80."}
        return {"output": output}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pitch-forge.final-output.get.failed",
        )
