"""Typed contracts for the governed Agent Builder read-only MVP."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


NodeType = Literal[
    "manual_trigger",
    "context_loader",
    "mcp_tool",
    "prompt_llm",
    "policy_gate",
    "cost_guardrail",
    "human_approval",
    "receipt_writer",
    "output",
    "eval_assertion",
]


class GraphPosition(BaseModel):
    x: float
    y: float


class AgentNode(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: NodeType
    label: str | None = Field(default=None, max_length=160)
    position: GraphPosition
    config: dict[str, Any] = Field(default_factory=dict)


class AgentEdge(BaseModel):
    id: str | None = None
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None
    data_type: str = "control"


class AgentLimits(BaseModel):
    max_runtime_seconds: int = Field(default=120, ge=1, le=600)
    max_tool_calls: int = Field(default=10, ge=0, le=100)
    max_cost_usd: float = Field(default=1.0, ge=0, le=100)


class AgentGraph(BaseModel):
    schema_version: Literal["agent-graph/v1"] = "agent-graph/v1"
    nodes: list[AgentNode]
    edges: list[AgentEdge]
    limits: AgentLimits = Field(default_factory=AgentLimits)
    model_route_policy: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def unique_ids(self) -> "AgentGraph":
        ids = [node.id for node in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("node ids must be unique")
        return self


class WorkflowCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    graph: AgentGraph
    tags: list[str] = Field(default_factory=list)


class WorkflowDraftRequest(BaseModel):
    base_version_number: int = Field(ge=1)
    graph: AgentGraph
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)


class DryRunRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)


class PublishRequest(BaseModel):
    status: Literal["staged", "published"] = "staged"
