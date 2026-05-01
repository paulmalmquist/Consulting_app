"""Schemas for REPE change-set MCP tools."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ChangeItemInput(BaseModel):
    model_config = {"extra": "forbid"}

    target_pk: dict[str, Any] = Field(default_factory=dict)
    target_column: str
    old_value: Any | None = None
    new_value: Any
    value_type: str | None = None


class StageChangeInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: str
    business_id: UUID
    entity_type: str
    entity_id: UUID | None = None
    period: str | None = None
    target_table: str
    source_prompt: str
    capability_key: str = "repe.stage_change"
    created_by: UUID | None = None
    changes: list[ChangeItemInput]


class ChangeSetIdInput(BaseModel):
    model_config = {"extra": "forbid"}

    change_set_id: UUID


class ApproveChangeInput(ChangeSetIdInput):
    approver_user_id: UUID | None = None
    decision: str = "approved"
    comment: str | None = None
    source_prompt: str | None = None


class CommitChangeInput(ChangeSetIdInput):
    committed_by: UUID | None = None
    source_prompt: str | None = None
