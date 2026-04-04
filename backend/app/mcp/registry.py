"""MCP Tool Registry — schema, permission, and audit policy for every tool."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Type

from app.assistant_runtime.turn_receipts import PermissionMode, SideEffectClass
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
    tags: frozenset[str] = field(default_factory=frozenset)
    side_effect_class: SideEffectClass | None = None
    permission_required: PermissionMode | None = None
    lane_tags: tuple[str, ...] = ()
    skill_tags: tuple[str, ...] = ()
    confirmation_required: bool | None = None
    result_adapter: str = "passthrough"

    def __post_init__(self) -> None:
        if self.side_effect_class is not None and not isinstance(self.side_effect_class, SideEffectClass):
            raise ValueError(f"Invalid side_effect_class for {self.name}: {self.side_effect_class}")
        if self.permission_required is not None and not isinstance(self.permission_required, PermissionMode):
            raise ValueError(f"Invalid permission_required for {self.name}: {self.permission_required}")
        if self.result_adapter.strip() == "":
            raise ValueError(f"result_adapter must be non-empty for {self.name}")

    @property
    def input_schema(self) -> dict:
        return self.input_model.model_json_schema()

    @property
    def output_schema(self) -> dict | None:
        if self.output_model:
            return self.output_model.model_json_schema()
        return None

    def manifest(self) -> dict[str, Any]:
        side_effect_class = self.side_effect_class or (
            SideEffectClass.WRITE if self.permission == "write" else SideEffectClass.READ
        )
        permission_required = self.permission_required or (
            PermissionMode.WRITE_CONFIRMED if self.permission == "write" else PermissionMode.READ
        )
        lane_tags = self.lane_tags or _default_lane_tags(self.permission, self.tags, self.module)
        skill_tags = self.skill_tags or _default_skill_tags(self.tags, self.module, self.permission)
        confirmation_required = (
            self.confirmation_required
            if self.confirmation_required is not None
            else self.permission == "write"
        )
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "side_effect_class": side_effect_class.value,
            "permission_required": permission_required.value,
            "lane_tags": list(lane_tags),
            "skill_tags": list(skill_tags),
            "confirmation_required": confirmation_required,
            "result_adapter": self.result_adapter,
        }


def _default_lane_tags(permission: str, tags: frozenset[str], module: str) -> tuple[str, ...]:
    if permission == "write":
        return ("C", "D")
    if "analysis" in tags or "report" in tags or "investor" in tags or module in {"documents", "report", "audit"}:
        return ("B", "C", "D")
    if "infra" in tags or module in {"repo", "bm"}:
        return ("B", "C")
    return ("A", "B", "C", "D")


def _default_skill_tags(tags: frozenset[str], module: str, permission: str) -> tuple[str, ...]:
    derived = set(tags)
    derived.add(module)
    if permission == "write":
        derived.add("write")
    if not derived:
        derived.add("core")
    return tuple(sorted(derived))


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

    def list_by_tags(self, include: set[str]) -> list[ToolDef]:
        """Return tools whose tags overlap with *include*."""
        return [t for t in self._tools.values() if t.tags & include]

    def describe_all(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "module": t.module,
                "permission": t.permission,
                "input_schema": t.input_schema,
                "output_schema": t.output_schema,
                **t.manifest(),
            }
            for t in self._tools.values()
        ]


# Global registry instance
registry = ToolRegistry()
