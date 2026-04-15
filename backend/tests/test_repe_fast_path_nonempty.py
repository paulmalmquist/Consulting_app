"""Regression guard — REPE fast-path must never produce empty dashboard shells.

Context: docs/LATEST.md (2026-03-22) flagged "repe_fast_path returns 0 tokens,
0 tools for all data queries. Creates empty dashboard shells." This test
locks in non-empty output from the dashboard composer, which is the payload
generator for the INTENT_GENERATE_DASHBOARD fast-path branch in
backend/app/services/ai_gateway.py:1272-1293.

If this test fails, the fast-path is serving empty `dynamic_dashboard`
results. Fix the composer path before anything else — empty dashboards
are a demo-humiliation vector (tips.md #14).

Scope of this guard:
  - composer layer only (synchronous, no DB, no tool execution)
  - 5 canonical prompts covering the four archetypes a prospect is most
    likely to hit in a live demo
  - asserts widgets > 0 AND result_type=="dynamic_dashboard" card shape
    is well-formed
"""
from __future__ import annotations

import pytest

from app.services.dashboard_composer import compose_dashboard_spec

pytestmark = pytest.mark.usefixtures("fake_cursor")

ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
BUS_ID = "a1b2c3d4-0001-0001-0001-000000000001"

CANONICAL_PROMPTS = [
    "build me a monthly operating report dashboard",
    "show me an executive summary",
    "build me a watchlist dashboard",
    "show me occupancy trend and dscr",
    "fund quarterly review",
]


@pytest.mark.parametrize("prompt", CANONICAL_PROMPTS)
def test_fast_path_prompt_yields_widgets(prompt: str):
    spec = compose_dashboard_spec(prompt, env_id=ENV_ID, business_id=BUS_ID)
    widgets = spec.get("widgets")
    assert isinstance(widgets, list), f"spec missing widgets list for prompt: {prompt!r}"
    assert len(widgets) > 0, (
        f"repe_fast_path regression: empty dashboard for prompt {prompt!r}. "
        f"See docs/LATEST.md bug log (2026-03-22)."
    )


@pytest.mark.parametrize("prompt", CANONICAL_PROMPTS)
def test_fast_path_spec_shape(prompt: str):
    """Every fast-path dashboard spec must carry the fields the SSE envelope depends on."""
    spec = compose_dashboard_spec(prompt, env_id=ENV_ID, business_id=BUS_ID)
    assert "name" in spec and spec["name"], f"missing 'name' for {prompt!r}"
    assert "archetype" in spec, f"missing 'archetype' for {prompt!r}"
    assert spec.get("entity_scope", {}).get("env_id") == ENV_ID
    assert spec.get("entity_scope", {}).get("business_id") == BUS_ID


def test_dashboard_card_surfaces_widget_count():
    """_build_dashboard_card reads widgets from the spec — guard that contract."""
    from app.services.ai_gateway import _build_dashboard_card

    spec = compose_dashboard_spec(
        "build me a monthly operating report dashboard",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    card = _build_dashboard_card(spec)
    widget_count = len(spec["widgets"])
    assert str(widget_count) in card["metrics"][0]["value"]
    assert widget_count > 0, "card would advertise '0 widgets' — empty-shell regression"
    assert card["actions"], "card missing actions (view_dashboard / edit_dashboard)"
