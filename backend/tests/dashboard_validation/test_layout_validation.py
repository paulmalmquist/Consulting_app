"""Level 2 — Layout validation: grid bounds, sizing rules, companion tables.

Pure Python tests — no DB needed.
"""
from __future__ import annotations

import pytest
from app.services.dashboard_composer import compose_dashboard_spec

from .conftest import ENV_ID, BUS_ID
from .prompt_pairs import PROMPT_PAIRS, FREEFORM_PAIRS, PromptPair


def _spec(prompt: str, **kw) -> dict:
    return compose_dashboard_spec(prompt, env_id=ENV_ID, business_id=BUS_ID, **kw)


# ═══════════════════════════════════════════════════════════════════════════
# GRID RULES (every prompt)
# ═══════════════════════════════════════════════════════════════════════════

class TestGridBounds:
    """Every widget must fit within the 12-column grid."""

    @pytest.mark.parametrize(
        "pair", PROMPT_PAIRS, ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_no_overflow(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        for w in spec["widgets"]:
            lay = w["layout"]
            assert lay["x"] + lay["w"] <= 12, (
                f"{pair.id} widget {w['id']}: x={lay['x']} + w={lay['w']} > 12"
            )

    @pytest.mark.parametrize(
        "pair", PROMPT_PAIRS, ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_non_negative_positions(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        for w in spec["widgets"]:
            lay = w["layout"]
            assert lay["x"] >= 0, f"{pair.id} widget {w['id']}: x={lay['x']} < 0"
            assert lay["y"] >= 0, f"{pair.id} widget {w['id']}: y={lay['y']} < 0"

    @pytest.mark.parametrize(
        "pair", PROMPT_PAIRS, ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_valid_dimensions(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        for w in spec["widgets"]:
            lay = w["layout"]
            assert 1 <= lay["w"] <= 12, (
                f"{pair.id} widget {w['id']}: invalid width {lay['w']}"
            )
            assert 1 <= lay["h"] <= 12, (
                f"{pair.id} widget {w['id']}: invalid height {lay['h']}"
            )

    @pytest.mark.parametrize(
        "pair", PROMPT_PAIRS, ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_unique_ids(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        ids = [w["id"] for w in spec["widgets"]]
        assert len(ids) == len(set(ids)), (
            f"{pair.id}: duplicate widget IDs: {ids}"
        )

    @pytest.mark.parametrize(
        "pair", PROMPT_PAIRS, ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_max_widget_count(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        assert len(spec["widgets"]) <= 20, (
            f"{pair.id}: {len(spec['widgets'])} widgets exceeds max 20"
        )


# ═══════════════════════════════════════════════════════════════════════════
# SIZING RULES
# ═══════════════════════════════════════════════════════════════════════════

class TestSizingRules:
    """Chart type → expected width/position rules."""

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_widget_count == 2
         and "comparison_table" not in p.expected_widget_types],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_widget_count == 2
             and "comparison_table" not in p.expected_widget_types],
    )
    def test_side_by_side_width(self, pair: PromptPair):
        """Two non-table freeform widgets should each be w=6."""
        spec = _spec(pair.prompt)
        non_table = [w for w in spec["widgets"] if w["type"] != "comparison_table"]
        for w in non_table:
            assert w["layout"]["w"] == 6, (
                f"{pair.id} widget {w['id']}: side-by-side should be w=6, "
                f"got w={w['layout']['w']}"
            )

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_widget_count == 1
         and p.expected_widget_types[0] in ("trend_line", "bar_chart")
         and p.expected_group_by is None
         and not p.expected_stacked],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_widget_count == 1
             and p.expected_widget_types[0] in ("trend_line", "bar_chart")
             and p.expected_group_by is None
             and not p.expected_stacked],
    )
    def test_single_chart_centering(self, pair: PromptPair):
        """A single chart without group_by should be centered (w=8, x=2)."""
        spec = _spec(pair.prompt)
        if len(spec["widgets"]) != 1:
            pytest.skip("Not a single-widget spec")
        w = spec["widgets"][0]
        assert w["layout"]["w"] == 8, (
            f"{pair.id}: single centered chart should be w=8, got w={w['layout']['w']}"
        )
        assert w["layout"]["x"] == 2, (
            f"{pair.id}: single centered chart should be x=2, got x={w['layout']['x']}"
        )

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS
         if "comparison_table" in p.expected_widget_types
         and p.expected_widget_count == 1],
        ids=[p.id for p in FREEFORM_PAIRS
             if "comparison_table" in p.expected_widget_types
             and p.expected_widget_count == 1],
    )
    def test_table_full_width(self, pair: PromptPair):
        """Tables should be full-width (w=12)."""
        spec = _spec(pair.prompt)
        for w in spec["widgets"]:
            if w["type"] in ("comparison_table", "statement_table"):
                assert w["layout"]["w"] == 12, (
                    f"{pair.id} widget {w['id']}: table should be w=12, "
                    f"got w={w['layout']['w']}"
                )


# ═══════════════════════════════════════════════════════════════════════════
# COMPANION TABLE INJECTION
# ═══════════════════════════════════════════════════════════════════════════

class TestCompanionTables:
    """Pipeline and geographic widgets should get companion comparison tables."""

    def test_pipeline_bar_companion(self):
        spec = _spec("Show me a pipeline dashboard")
        types = [w["type"] for w in spec["widgets"]]
        if "pipeline_bar" in types:
            assert "comparison_table" in types, (
                "pipeline_bar should inject a companion comparison_table"
            )

    def test_geographic_map_companion(self):
        spec = _spec("Geographic analysis of our portfolio")
        types = [w["type"] for w in spec["widgets"]]
        if "geographic_map" in types:
            assert "comparison_table" in types, (
                "geographic_map should inject a companion comparison_table"
            )


# ═══════════════════════════════════════════════════════════════════════════
# ANALYTICAL INTENT → CHART TYPE MAPPING
# ═══════════════════════════════════════════════════════════════════════════

class TestAnalyticalIntentMapping:
    """Verify that analytical intent phrases map to the correct chart types."""

    @pytest.mark.parametrize("prompt,expected_type", [
        ("NOI over time", "trend_line"),
        ("occupancy trend by asset", "trend_line"),
        ("DSCR trend", "trend_line"),
        ("revenue vs expenses by asset", "bar_chart"),
        ("compare capex across assets", "bar_chart"),
        ("top 5 investments by NOI", "bar_chart"),
        ("Table of assets ranked by NOI", "comparison_table"),
        ("budget vs actual NOI", "bar_chart"),
        ("NOI distribution across investments", "bar_chart"),
        ("stacked bar chart of revenue", "bar_chart"),
    ])
    def test_intent_to_chart_type(self, prompt: str, expected_type: str):
        spec = _spec(prompt)
        types = [w["type"] for w in spec["widgets"]]
        assert expected_type in types, (
            f"Prompt '{prompt}' should produce '{expected_type}', got {types}"
        )

    @pytest.mark.parametrize("prompt", [
        "NOI over time",
        "occupancy trend by asset",
        "DSCR trend",
        "asset value trend monthly",
    ])
    def test_time_prompts_produce_trend_line(self, prompt: str):
        spec = _spec(prompt)
        assert any(w["type"] == "trend_line" for w in spec["widgets"]), (
            f"Time-based prompt '{prompt}' should produce trend_line"
        )

    @pytest.mark.parametrize("prompt", [
        "compare revenue and expenses by asset",
        "compare capex across all assets",
        "compare NOI margin across markets",
    ])
    def test_compare_prompts_produce_bar_chart(self, prompt: str):
        spec = _spec(prompt)
        assert any(w["type"] == "bar_chart" for w in spec["widgets"]), (
            f"Compare prompt '{prompt}' should produce bar_chart"
        )
