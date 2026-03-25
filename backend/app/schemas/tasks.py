from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class TaskBoardType(str, Enum):
    kanban = "kanban"
    scrum = "scrum"


class TaskStatusCategory(str, Enum):
    todo = "todo"
    doing = "doing"
    done = "done"


class TaskIssueType(str, Enum):
    task = "task"
    bug = "bug"
    story = "story"
    epic = "epic"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TaskSprintStatus(str, Enum):
    planned = "planned"
    active = "active"
    closed = "closed"


class TaskLinkType(str, Enum):
    blocks = "blocks"
    blocked_by = "blocked_by"
    relates_to = "relates_to"
    duplicates = "duplicates"


class TaskContextLinkKind(str, Enum):
    department = "department"
    capability = "capability"
    environment = "environment"
    document = "document"
    execution = "execution"
    run = "run"
    report = "report"
    metric = "metric"


class TaskProjectOut(BaseModel):
    id: UUID
    name: str
    key: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class TaskBoardOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    board_type: TaskBoardType
    created_at: datetime


class CreateTaskProjectRequest(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=200)
    key: str = Field(min_length=2, max_length=12)
    description: str | None = None
    board_type: TaskBoardType = TaskBoardType.scrum


class TaskStatusOut(BaseModel):
    id: UUID
    project_id: UUID
    key: str
    name: str
    category: TaskStatusCategory
    order_index: int
    color_token: str | None = None
    is_default: bool


class CreateTaskStatusRequest(BaseModel):
    model_config = {"extra": "forbid"}
    key: str = Field(min_length=1, max_length=48)
    name: str = Field(min_length=1, max_length=120)
    category: TaskStatusCategory
    order_index: int | None = Field(default=None, ge=0)
    color_token: str | None = Field(default=None, max_length=64)
    is_default: bool = False


class TaskSprintOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    start_date: date | None = None
    end_date: date | None = None
    status: TaskSprintStatus
    created_at: datetime


class CreateTaskSprintRequest(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    status: TaskSprintStatus = TaskSprintStatus.planned


class TaskIssueOut(BaseModel):
    id: UUID
    project_id: UUID
    project_key: str
    issue_key: str
    type: TaskIssueType
    title: str
    description_md: str
    status_id: UUID
    status_key: str
    status_name: str
    status_category: TaskStatusCategory
    priority: TaskPriority
    assignee: str | None = None
    reporter: str
    labels: list[str] = []
    estimate_points: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None
    sprint_name: str | None = None
    backlog_rank: float
    created_at: datetime
    updated_at: datetime


class CreateTaskIssueRequest(BaseModel):
    model_config = {"extra": "forbid"}
    type: TaskIssueType = TaskIssueType.task
    title: str = Field(min_length=1, max_length=500)
    description_md: str | None = None
    status_id: UUID | None = None
    priority: TaskPriority = TaskPriority.medium
    assignee: str | None = None
    reporter: str = Field(min_length=1, max_length=120)
    labels: list[str] = []
    estimate_points: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None
    backlog_rank: float | None = None


class PatchTaskIssueRequest(BaseModel):
    model_config = {"extra": "forbid"}
    type: TaskIssueType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description_md: str | None = None
    status_id: UUID | None = None
    priority: TaskPriority | None = None
    assignee: str | None = None
    reporter: str | None = None
    labels: list[str] | None = None
    estimate_points: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None
    backlog_rank: float | None = None
    actor: str | None = None


class MoveTaskIssueRequest(BaseModel):
    model_config = {"extra": "forbid"}
    status_id: UUID | None = None
    sprint_id: UUID | None = None
    backlog_rank: float | None = None
    actor: str | None = None


class CreateTaskCommentRequest(BaseModel):
    model_config = {"extra": "forbid"}
    author: str = Field(min_length=1, max_length=120)
    body_md: str = Field(min_length=1, max_length=10_000)


class TaskCommentOut(BaseModel):
    id: UUID
    issue_id: UUID
    author: str
    body_md: str
    created_at: datetime


class CreateTaskIssueLinkRequest(BaseModel):
    model_config = {"extra": "forbid"}
    to_issue_id: UUID
    link_type: TaskLinkType
    actor: str | None = None


class TaskIssueLinkOut(BaseModel):
    id: UUID
    from_issue_id: UUID
    from_issue_key: str
    to_issue_id: UUID
    to_issue_key: str
    link_type: TaskLinkType


class CreateTaskAttachmentRequest(BaseModel):
    model_config = {"extra": "forbid"}
    document_id: UUID
    actor: str | None = None


class TaskAttachmentOut(BaseModel):
    id: UUID
    issue_id: UUID
    document_id: UUID
    document_title: str | None = None
    document_virtual_path: str | None = None
    created_at: datetime


class CreateTaskContextLinkRequest(BaseModel):
    model_config = {"extra": "forbid"}
    link_kind: TaskContextLinkKind
    link_ref: str = Field(min_length=1, max_length=200)
    link_label: str = Field(min_length=1, max_length=240)
    actor: str | None = None


class TaskContextLinkOut(BaseModel):
    id: UUID
    issue_id: UUID
    link_kind: TaskContextLinkKind
    link_ref: str
    link_label: str


class TaskActivityOut(BaseModel):
    id: UUID
    issue_id: UUID
    actor: str
    action: str
    before_json: dict[str, Any] | None = None
    after_json: dict[str, Any] | None = None
    created_at: datetime


class TaskIssueDetailOut(TaskIssueOut):
    comments: list[TaskCommentOut] = []
    links: list[TaskIssueLinkOut] = []
    attachments: list[TaskAttachmentOut] = []
    context_links: list[TaskContextLinkOut] = []
    activity: list[TaskActivityOut] = []


class TaskStatusCountOut(BaseModel):
    status_key: str
    status_name: str
    category: TaskStatusCategory
    count: int


class TaskThroughputPointOut(BaseModel):
    week: str
    completed_count: int


class TaskLabelCountOut(BaseModel):
    label: str
    count: int


class TaskAnalyticsOut(BaseModel):
    project_id: UUID
    created_count: int
    completed_count: int
    wip_count: int
    cycle_time_days: float
    by_status: list[TaskStatusCountOut]
    throughput_by_week: list[TaskThroughputPointOut]
    cycle_time_histogram: dict[str, int]
    top_labels: list[TaskLabelCountOut]


class TaskSeedResult(BaseModel):
    project_id: UUID
    project_key: str
    created_project: bool
    created_issues: int
    total_issues: int


class MetricDataPointOut(BaseModel):
    key: str
    value: float | int | dict[str, int]
    unit: str | None = None


class MetricsResponse(BaseModel):
    generated_at: datetime
    project_id: UUID | None = None
    data_points: list[MetricDataPointOut]
