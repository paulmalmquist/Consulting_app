from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.tasks import (
    CreateTaskAttachmentRequest,
    CreateTaskCommentRequest,
    CreateTaskContextLinkRequest,
    CreateTaskIssueLinkRequest,
    CreateTaskIssueRequest,
    CreateTaskProjectRequest,
    CreateTaskSprintRequest,
    CreateTaskStatusRequest,
    MoveTaskIssueRequest,
    PatchTaskIssueRequest,
    TaskAnalyticsOut,
    TaskAttachmentOut,
    TaskBoardOut,
    TaskCommentOut,
    TaskContextLinkOut,
    TaskIssueDetailOut,
    TaskIssueLinkOut,
    TaskIssueOut,
    TaskProjectOut,
    TaskSeedResult,
    TaskSprintOut,
    TaskStatusOut,
)
from app.services import tasks as tasks_svc


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/projects", response_model=list[TaskProjectOut])
def list_projects():
    return [TaskProjectOut(**row) for row in tasks_svc.list_projects()]


@router.post("/projects", response_model=TaskProjectOut)
def create_project(req: CreateTaskProjectRequest):
    try:
        row = tasks_svc.create_project(
            name=req.name,
            key=req.key,
            description=req.description,
            board_type=req.board_type.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if "duplicate key value" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Project key already exists")
        raise
    return TaskProjectOut(**row)


@router.get("/projects/key/{project_key}", response_model=TaskProjectOut)
def get_project_by_key(project_key: str):
    row = tasks_svc.get_project_by_key(project_key)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return TaskProjectOut(**row)


@router.get("/projects/{project_id}", response_model=TaskProjectOut)
def get_project(project_id: UUID):
    row = tasks_svc.get_project(project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return TaskProjectOut(**row)


@router.get("/projects/{project_id}/boards", response_model=list[TaskBoardOut])
def list_boards(project_id: UUID):
    return [TaskBoardOut(**row) for row in tasks_svc.list_boards(project_id)]


@router.get("/projects/{project_id}/statuses", response_model=list[TaskStatusOut])
def list_statuses(project_id: UUID):
    return [TaskStatusOut(**row) for row in tasks_svc.list_statuses(project_id)]


@router.post("/projects/{project_id}/statuses", response_model=TaskStatusOut)
def create_status(project_id: UUID, req: CreateTaskStatusRequest):
    try:
        row = tasks_svc.create_status(
            project_id,
            key=req.key,
            name=req.name,
            category=req.category.value,
            order_index=req.order_index,
            color_token=req.color_token,
            is_default=req.is_default,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if "duplicate key value" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Status key already exists for project")
        raise
    return TaskStatusOut(**row)


@router.get("/projects/{project_id}/issues", response_model=list[TaskIssueOut])
def list_issues(
    project_id: UUID,
    status: Optional[str] = Query(None),
    sprint: Optional[str] = Query(None),
    assignee: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    label: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
):
    rows = tasks_svc.list_issues(
        project_id,
        status=status,
        sprint=sprint,
        assignee=assignee,
        q=q,
        label=label,
        priority=priority,
    )
    return [TaskIssueOut(**row) for row in rows]


@router.post("/projects/{project_id}/issues", response_model=TaskIssueOut)
def create_issue(project_id: UUID, req: CreateTaskIssueRequest):
    try:
        row = tasks_svc.create_issue(
            project_id,
            issue_type=req.type.value,
            title=req.title,
            description_md=req.description_md,
            status_id=req.status_id,
            priority=req.priority.value,
            assignee=req.assignee,
            reporter=req.reporter,
            labels=req.labels,
            estimate_points=req.estimate_points,
            due_date=req.due_date,
            sprint_id=req.sprint_id,
            backlog_rank=req.backlog_rank,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TaskIssueOut(**row)


@router.get("/issues/{issue_id}", response_model=TaskIssueDetailOut)
def get_issue(issue_id: UUID):
    row = tasks_svc.get_issue(issue_id)
    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")
    return TaskIssueDetailOut(**row)


@router.patch("/issues/{issue_id}", response_model=TaskIssueOut)
def patch_issue(issue_id: UUID, req: PatchTaskIssueRequest):
    try:
        row = tasks_svc.update_issue(issue_id, req.model_dump(exclude_unset=True))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TaskIssueOut(**row)


@router.post("/issues/{issue_id}/move", response_model=TaskIssueOut)
def move_issue(issue_id: UUID, req: MoveTaskIssueRequest):
    try:
        row = tasks_svc.move_issue(
            issue_id,
            status_id=req.status_id,
            status_specified="status_id" in req.model_fields_set,
            sprint_id=req.sprint_id,
            sprint_specified="sprint_id" in req.model_fields_set,
            backlog_rank=req.backlog_rank,
            backlog_rank_specified="backlog_rank" in req.model_fields_set,
            actor=(req.actor or "system"),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TaskIssueOut(**row)


@router.post("/issues/{issue_id}/comments", response_model=TaskCommentOut)
def add_comment(issue_id: UUID, req: CreateTaskCommentRequest):
    try:
        row = tasks_svc.add_comment(issue_id, author=req.author, body_md=req.body_md)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskCommentOut(**row)


@router.post("/issues/{issue_id}/links", response_model=TaskIssueLinkOut)
def add_issue_link(issue_id: UUID, req: CreateTaskIssueLinkRequest):
    try:
        row = tasks_svc.add_issue_link(
            issue_id,
            to_issue_id=req.to_issue_id,
            link_type=req.link_type.value,
            actor=req.actor,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TaskIssueLinkOut(**row)


@router.post("/issues/{issue_id}/attachments", response_model=TaskAttachmentOut)
def add_attachment(issue_id: UUID, req: CreateTaskAttachmentRequest):
    try:
        row = tasks_svc.add_attachment(issue_id, document_id=req.document_id, actor=req.actor)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskAttachmentOut(**row)


@router.post("/issues/{issue_id}/context-links", response_model=TaskContextLinkOut)
def add_context_link(issue_id: UUID, req: CreateTaskContextLinkRequest):
    try:
        row = tasks_svc.add_context_link(
            issue_id,
            link_kind=req.link_kind.value,
            link_ref=req.link_ref,
            link_label=req.link_label,
            actor=req.actor,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskContextLinkOut(**row)


@router.get("/projects/{project_id}/sprints", response_model=list[TaskSprintOut])
def list_sprints(project_id: UUID):
    return [TaskSprintOut(**row) for row in tasks_svc.list_sprints(project_id)]


@router.post("/projects/{project_id}/sprints", response_model=TaskSprintOut)
def create_sprint(project_id: UUID, req: CreateTaskSprintRequest):
    try:
        row = tasks_svc.create_sprint(
            project_id,
            name=req.name,
            start_date=req.start_date,
            end_date=req.end_date,
            status=req.status.value,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        if "duplicate key value" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Sprint name already exists for project")
        raise
    return TaskSprintOut(**row)


@router.post("/sprints/{sprint_id}/start", response_model=TaskSprintOut)
def start_sprint(sprint_id: UUID):
    try:
        row = tasks_svc.start_sprint(sprint_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskSprintOut(**row)


@router.post("/sprints/{sprint_id}/close", response_model=TaskSprintOut)
def close_sprint(sprint_id: UUID):
    try:
        row = tasks_svc.close_sprint(sprint_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskSprintOut(**row)


@router.get("/projects/{project_id}/analytics", response_model=TaskAnalyticsOut)
def get_project_analytics(project_id: UUID):
    try:
        row = tasks_svc.get_project_analytics(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskAnalyticsOut(**row)


@router.post("/seed/novendor_winston_build", response_model=TaskSeedResult)
def seed_novendor_winston_build():
    try:
        row = tasks_svc.seed_novendor_winston_build()
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return TaskSeedResult(**row)
