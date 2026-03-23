from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class NvContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)
