"""MCP Tool Registry — schema, permission, and audit policy for every tool."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Type

from pydantic import BaseModel


@dataclass(frozen=True)
class AuditPolicy:
    redact_keys: list[str] = field(default_factory=list)
    redact_value_patterns: list[re.Pattern] = field(default_factory=list)
    max_input_bytes_to_log: int = 10_000
    max_output_bytes_to_log: int = 10_000
    output_summarizer: Callable[[Any], dict] | None = None


@dataclass(frozen=True)
class ToolDef:
    name: str
    description: str
    module: str  # business | documents | executions | work | audit | repo | bm
    permission: str  # "read" or "write"
    input_model: Type[BaseModel]
    output_model: Type[BaseModel] | None = None
    audit_policy: AuditPolicy = field(default_factory=AuditPolicy)
    handler: Callable | None = None

    @property
    def input_schema(self) -> dict:
        return self.input_model.model_json_schema()

    @property
    def output_schema(self) -> dict | None:
        if self.output_model:
            return self.output_model.model_json_schema()
        return None


class ToolRegistry:
    """Singleton registry of all MCP tools."""

    def __init__(self):
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool: ToolDef) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Duplicate tool name: {tool.name}")
        if tool.permission not in ("read", "write"):
            raise ValueError(f"Invalid permission '{tool.permission}' for {tool.name}")
        self._tools[tool.name] = tool

    def clear(self) -> None:
        """Remove all registered tools. For testing only."""
        self._tools.clear()

    def get(self, name: str) -> ToolDef | None:
        return self._tools.get(name)

    def list_all(self) -> list[ToolDef]:
        return list(self._tools.values())

    def list_by_module(self, module: str) -> list[ToolDef]:
        return [t for t in self._tools.values() if t.module == module]

    def describe_all(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "module": t.module,
                "permission": t.permission,
                "input_schema": t.input_schema,
                "output_schema": t.output_schema,
            }
            for t in self._tools.values()
        ]


# Global registry instance
registry = ToolRegistry()
