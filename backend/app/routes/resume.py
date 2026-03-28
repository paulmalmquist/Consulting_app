from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.resume import (
    ResumeAssistantRequestIn,
    ResumeAssistantResponseOut,
    ResumeCareerSummaryOut,
    ResumeContextOut,
    ResumeDeploymentOut,
    ResumeProjectOut,
    ResumeRoleOut,
    ResumeSkillOut,
    ResumeSystemComponentOut,
    ResumeSystemStatsOut,
    ResumeWorkspaceOut,
)
from app.services import resume as resume_svc
from app.services import env_context

router = APIRouter(prefix="/api/resume/v1", tags=["resume"])


def _resolve_context(
    request: Request,
    env_id: str | None,
    business_id: UUID | None,
    *,
    ensure_seeded: bool = True,
):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="resume",
    )
    resolved_env_id = UUID(ctx.env_id)
    resolved_business_id = UUID(ctx.business_id)
    if ensure_seeded:
        resume_svc.seed_demo_workspace(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
        )
    return resolved_env_id, resolved_business_id, ctx


@router.get("/context", response_model=ResumeContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return ResumeContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.context.failed")


@router.get("/roles", response_model=list[ResumeRoleOut])
def list_roles(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [ResumeRoleOut(**row) for row in resume_svc.list_roles(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.roles.list_failed")


@router.get("/roles/{role_id}", response_model=ResumeRoleOut)
def get_role(role_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = resume_svc.get_role(env_id=resolved_env_id, business_id=resolved_business_id, role_id=role_id)
        return ResumeRoleOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.roles.get_failed")


@router.get("/skills", response_model=list[ResumeSkillOut])
def list_skills(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), category: str | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [ResumeSkillOut(**row) for row in resume_svc.list_skills(env_id=resolved_env_id, business_id=resolved_business_id, category=category)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.skills.list_failed")


@router.get("/projects", response_model=list[ResumeProjectOut])
def list_projects(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status")):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [ResumeProjectOut(**row) for row in resume_svc.list_projects(env_id=resolved_env_id, business_id=resolved_business_id, status=status_filter)]
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status_code, code=code, detail=str(exc), action="resume.projects.list_failed")


@router.get("/projects/{project_id}", response_model=ResumeProjectOut)
def get_project(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = resume_svc.get_project(env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id)
        return ResumeProjectOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.projects.get_failed")


@router.get("/career-summary", response_model=ResumeCareerSummaryOut)
def get_career_summary(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return ResumeCareerSummaryOut(**resume_svc.get_career_summary(env_id=resolved_env_id, business_id=resolved_business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.career_summary.failed")


@router.get("/skill-matrix")
def get_skill_matrix(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return resume_svc.get_skill_matrix(env_id=resolved_env_id, business_id=resolved_business_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.skill_matrix.failed")


@router.get("/system-components", response_model=list[ResumeSystemComponentOut])
def list_system_components(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [ResumeSystemComponentOut(**row) for row in resume_svc.list_system_components(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.system_components.list_failed")


@router.get("/deployments", response_model=list[ResumeDeploymentOut])
def list_deployments(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [ResumeDeploymentOut(**row) for row in resume_svc.list_deployments(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.deployments.list_failed")


@router.get("/system-stats", response_model=ResumeSystemStatsOut)
def get_system_stats(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return ResumeSystemStatsOut(**resume_svc.get_system_stats(env_id=resolved_env_id, business_id=resolved_business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.system_stats.failed")


@router.get("/workspace", response_model=ResumeWorkspaceOut)
def get_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return ResumeWorkspaceOut(**resume_svc.get_workspace_payload(env_id=resolved_env_id, business_id=resolved_business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.workspace.failed")


@router.post("/assistant", response_model=ResumeAssistantResponseOut)
def run_assistant(request: Request, payload: ResumeAssistantRequestIn):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, payload.env_id, payload.business_id)
        return ResumeAssistantResponseOut(
            **resume_svc.get_assistant_response(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                query=payload.query,
                context=payload.context.model_dump(),
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.assistant.failed")


@router.post("/seed")
def seed_resume(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(
            request,
            env_id,
            business_id,
            ensure_seeded=False,
        )
        return resume_svc.seed_demo_workspace(env_id=resolved_env_id, business_id=resolved_business_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="resume.seed.failed")
