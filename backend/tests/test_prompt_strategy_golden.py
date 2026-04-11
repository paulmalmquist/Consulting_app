"""Golden-set regression for the Prompt Strategy + Compiler pipeline.

Each JSON fixture under ``tests/fixtures/prompt_golden/`` describes a
scenario (router decision + scope + history + user message) and the
expected ``CompositionPlan`` + ``CompiledContext`` shape. Any change to
``STRATEGY_VERSION`` or ``COMPOSER_VERSION`` that alters these outputs must
come with a fixture refresh.

Fixtures intentionally do not assert exact token counts — they lock down
the *shape* (which profile, which lane, which skill source, which sections
are included, whether deictic resolution fired) so the diagnostic story
stays stable turn-to-turn.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

from app.services.context_compiler import compile_context
from app.services.prompt_strategy import strategize


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "prompt_golden"


@dataclass
class _Scope:
    resolved_scope_type: str = "environment"
    environment_id: str | None = None
    business_id: str | None = None
    schema_name: str | None = None
    industry: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    confidence: float = 1.0
    source: str = "test"


@dataclass
class _Page:
    title: str | None = None
    route: str | None = None
    visible_widgets: list[str] | None = None


@dataclass
class _Filters:
    quarter: str | None = None
    scenario: str | None = None
    date_range: str | None = None


@dataclass
class _Envelope:
    environment_name: str | None = None
    page: _Page | None = None
    filters: _Filters | None = None
    visible_records: Any = None
    quarter: str | None = None


def _build_scope(payload: dict[str, Any]) -> _Scope:
    return _Scope(
        environment_id=payload.get("environment_id"),
        business_id=payload.get("business_id"),
        entity_type=payload.get("entity_type"),
        entity_id=payload.get("entity_id"),
        entity_name=payload.get("entity_name"),
    )


def _build_envelope(payload: dict[str, Any]) -> _Envelope:
    page = None
    if payload.get("page"):
        p = payload["page"]
        page = _Page(
            title=p.get("title"),
            route=p.get("route"),
            visible_widgets=p.get("visible_widgets") or [],
        )
    filters = None
    if payload.get("filters"):
        f = payload["filters"]
        filters = _Filters(
            quarter=f.get("quarter"),
            scenario=f.get("scenario"),
            date_range=f.get("date_range"),
        )
    return _Envelope(
        environment_name=payload.get("environment_name"),
        page=page,
        filters=filters,
    )


def _load_fixtures() -> list[tuple[str, dict[str, Any]]]:
    if not FIXTURE_DIR.exists():
        return []
    out: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        data = json.loads(path.read_text())
        out.append((data.get("id", path.stem), data))
    return out


@pytest.mark.parametrize("fixture_id,fixture", _load_fixtures())
def test_golden_fixture(fixture_id: str, fixture: dict[str, Any]):
    expected = fixture.get("expected") or {}

    plan = strategize(
        router_lane=fixture["router_lane"],
        router_skill_id=fixture.get("router_skill_id"),
        router_intent=fixture.get("router_intent"),
        resolved_scope=_build_scope(fixture.get("scope") or {}),
        context_envelope=_build_envelope(fixture.get("envelope") or {}),
        history_messages=fixture.get("history") or [],
        summary_text=fixture.get("summary_text"),
        summary_version=fixture.get("summary_version"),
        user_message=fixture["user_message"],
    )

    if "profile" in expected:
        assert plan.profile.name == expected["profile"], (
            f"{fixture_id}: expected profile={expected['profile']}, got {plan.profile.name}"
        )
    if "lane" in expected:
        assert plan.lane == expected["lane"], (
            f"{fixture_id}: expected lane={expected['lane']}, got {plan.lane}"
        )
    if "is_minimal" in expected:
        assert plan.is_minimal is expected["is_minimal"], (
            f"{fixture_id}: is_minimal expected={expected['is_minimal']}, got {plan.is_minimal}"
        )
    if expected.get("scope_downgraded"):
        assert plan.diagnostics.get("scope_downgrade_applied") is True, (
            f"{fixture_id}: scope downgrade expected but diagnostics={plan.diagnostics}"
        )
    if "resolved_user_text_contains" in expected:
        for needle in expected["resolved_user_text_contains"]:
            assert needle in plan.resolved_user_text, (
                f"{fixture_id}: resolved_user_text missing {needle!r}: {plan.resolved_user_text!r}"
            )
    if "skill_source_in" in expected and plan.skill_id:
        assert plan.skill_source in expected["skill_source_in"], (
            f"{fixture_id}: skill_source={plan.skill_source} not in {expected['skill_source_in']}"
        )

    # Minimal-mode scenarios skip the compiler entirely — we've already
    # asserted plan.is_minimal above.
    if plan.is_minimal:
        return

    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=fixture.get("history") or [],
        raw_rag_chunks=[],
        workflow_augmentation="",
    )

    included_keys = {k for k, item in compiled.items.items() if item.included}
    if "must_include_keys" in expected:
        for key in expected["must_include_keys"]:
            assert key in included_keys, (
                f"{fixture_id}: expected included key {key!r}, got {sorted(included_keys)}"
            )
    if "must_exclude_keys" in expected:
        for key in expected["must_exclude_keys"]:
            assert key not in included_keys, (
                f"{fixture_id}: expected excluded key {key!r}, got {sorted(included_keys)}"
            )
