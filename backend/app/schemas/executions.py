from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class RunExecutionRequest(BaseModel):
    business_id: UUID
    department_id: UUID
    capability_id: UUID
    inputs_json: dict = {}


class RunExecutionResponse(BaseModel):
    run_id: UUID
    status: str
    outputs_json: dict = {}


class ExecutionOut(BaseModel):
    execution_id: UUID
    business_id: UUID
    department_id: Optional[UUID] = None
    capability_id: Optional[UUID] = None
    status: str
    inputs_json: dict = {}
    outputs_json: dict = {}
    created_at: datetime
