from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ResumeContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class ResumeRoleOut(BaseModel):
    role_id: UUID
    env_id: UUID
    business_id: UUID
    company: str
    division: str | None = None
    title: str
    location: str | None = None
    start_date: date
    end_date: date | None = None
    role_type: str
    industry: str | None = None
    summary: str | None = None
    highlights: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    sort_order: int = 0
    created_at: datetime


class ResumeSkillOut(BaseModel):
    skill_id: UUID
    env_id: UUID
    business_id: UUID
    name: str
    category: str
    proficiency: int
    years_used: int | None = None
    context: str | None = None
    current: bool = True
    created_at: datetime


class ResumeProjectOut(BaseModel):
    project_id: UUID
    env_id: UUID
    business_id: UUID
    name: str
    client: str | None = None
    role_id: UUID | None = None
    status: str
    summary: str | None = None
    impact: str | None = None
    technologies: list[str] = Field(default_factory=list)
    metrics: list[dict[str, Any]] = Field(default_factory=list)
    url: str | None = None
    sort_order: int = 0
    created_at: datetime


class ResumeCareerSummaryOut(BaseModel):
    total_years: float
    total_roles: int
    total_companies: int
    total_skills: int
    total_projects: int
    education: str
    location: str
    current_title: str
    current_company: str
