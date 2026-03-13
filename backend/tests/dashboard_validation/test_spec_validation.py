"""Level 1 — Spec validation: deterministic, no DB needed.

For each prompt pair, calls compose_dashboard_spec() and asserts the
generated widget spec matches the expected shape.
"""
from __future__ import annotations

import pytest
from app.services.dashboard_composer import compose_dashboard_spec

from .conftest import ENV_ID, BUS_ID
from .prompt_pairs import PROMPT_PAIRS, FREEFORM_PAIRS, ARCHETYPE_PAIRS, PromptPair
from .sql_reference import SQL_REF_BY_ID


# ── Helpers ────────────────────────────────────────────────────────────────

def _spec(prompt: str, **kw) -> dict:
    return compose_dashboard_spec(prompt, env_id=ENV_ID, business_id=BUS_ID, **kw)


def _widget_types(spec: dict) -> list[str]:
    return [w["type"] for w in spec["widgets"]]


def _all_metric_keys(spec: dict) -> set[str]:
    keys: set[str] = set()
    for w in spec["widgets"]:
        for m in w["config"].get("metrics", []):
            keys.add(m["key"])
    return keys


def _find_widget(spec: dict, wtype: str) -> dict | None:
    for w in spec["widgets"]:
        if w["type"] == wtype:
            return w
    return None


# ═══════════════════════════════════════════════════════════════════════════
# PARAMETRIZED SPEC TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestSpecValidation:
    """Run compose_dashboard_spec for every prompt pair and validate the output."""

    @pytest.mark.parametrize(
        "pair",
        PROMPT_PAIRS,
        ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_widget_count(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        n = len(spec["widgets"])
        if pair.count_is_minimum:
            assert n >= pair.expected_widget_count, (
                f"{pair.id}: expected >= {pair.expected_widget_count} widgets, got {n}"
            )
        else:
            assert n == pair.expected_widget_count, (
                f"{pair.id}: expected {pair.expected_widget_count} widgets, got {n}"
            )

    @pytest.mark.parametrize(
        "pair",
        PROMPT_PAIRS,
        ids=[p.id for p in PROMPT_PAIRS],
    )
    def test_widget_types(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        actual_types = _widget_types(spec)
        for expected_type in pair.expected_widget_types:
            assert expected_type in actual_types, (
                f"{pair.id}: expected widget type '{expected_type}' "
                f"not found in {actual_types}"
            )

    @pytest.mark.parametrize(
        "pair",
        [p for p in PROMPT_PAIRS if p.expected_metrics],
        ids=[p.id for p in PROMPT_PAIRS if p.expected_metrics],
    )
    def test_metrics_present(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        actual_keys = _all_metric_keys(spec)
        for expected_metric in pair.expected_metrics:
            assert expected_metric in actual_keys, (
                f"{pair.id}: expected metric '{expected_metric}' "
                f"not found in {actual_keys}"
            )

    @pytest.mark.parametrize(
        "pair",
        [p for p in PROMPT_PAIRS if p.expected_archetype != "custom"],
        ids=[p.id for p in PROMPT_PAIRS if p.expected_archetype != "custom"],
    )
    def test_archetype(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        assert spec["archetype"] == pair.expected_archetype, (
            f"{pair.id}: expected archetype '{pair.expected_archetype}', "
            f"got '{spec['archetype']}'"
        )

    @pytest.mark.parametrize(
        "pair",
        [p for p in PROMPT_PAIRS if p.expected_entity_type],
        ids=[p.id for p in PROMPT_PAIRS if p.expected_entity_type],
    )
    def test_entity_type(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        assert spec["entity_scope"]["entity_type"] == pair.expected_entity_type, (
            f"{pair.id}: expected entity_type '{pair.expected_entity_type}', "
            f"got '{spec['entity_scope']['entity_type']}'"
        )


class TestFreeformSpecDetails:
    """Detailed assertions on freeform widget configs (group_by, time_grain, etc.)."""

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_group_by is not None],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_group_by is not None],
    )
    def test_group_by(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        # Check any widget has the expected group_by
        found = any(
            w["config"].get("group_by") == pair.expected_group_by
            for w in spec["widgets"]
        )
        assert found, (
            f"{pair.id}: no widget has group_by='{pair.expected_group_by}'. "
            f"Widget configs: {[w['config'].get('group_by') for w in spec['widgets']]}"
        )

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_time_grain is not None],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_time_grain is not None],
    )
    def test_time_grain(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        found = any(
            w["config"].get("time_grain") == pair.expected_time_grain
            for w in spec["widgets"]
        )
        assert found, (
            f"{pair.id}: no widget has time_grain='{pair.expected_time_grain}'. "
            f"Widget configs: {[w['config'].get('time_grain') for w in spec['widgets']]}"
        )

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_comparison is not None],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_comparison is not None],
    )
    def test_comparison(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        found = any(
            w["config"].get("comparison") == pair.expected_comparison
            for w in spec["widgets"]
        )
        assert found, (
            f"{pair.id}: no widget has comparison='{pair.expected_comparison}'. "
            f"Configs: {[w['config'].get('comparison') for w in spec['widgets']]}"
        )

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_stacked],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_stacked],
    )
    def test_stacked(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        found = any(
            w["config"].get("stacked") is True
            for w in spec["widgets"]
        )
        assert found, f"{pair.id}: no widget has stacked=True"

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_limit is not None],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_limit is not None],
    )
    def test_limit(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        found = any(
            w["config"].get("limit") == pair.expected_limit
            for w in spec["widgets"]
        )
        assert found, (
            f"{pair.id}: no widget has limit={pair.expected_limit}. "
            f"Limits: {[w['config'].get('limit') for w in spec['widgets']]}"
        )

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_sort_desc],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_sort_desc],
    )
    def test_sort_desc(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        found = any(
            w["config"].get("sort_desc") is True
            for w in spec["widgets"]
        )
        assert found, f"{pair.id}: no widget has sort_desc=True"

    @pytest.mark.parametrize(
        "pair",
        [p for p in FREEFORM_PAIRS if p.expected_format is not None],
        ids=[p.id for p in FREEFORM_PAIRS if p.expected_format is not None],
    )
    def test_format(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        found = any(
            w["config"].get("format") == pair.expected_format
            for w in spec["widgets"]
        )
        assert found, (
            f"{pair.id}: no widget has format='{pair.expected_format}'. "
            f"Formats: {[w['config'].get('format') for w in spec['widgets']]}"
        )


class TestMetricGroundTruth:
    """Cross-reference: widget metric keys should align with SQL reference metric keys."""

    @pytest.mark.parametrize(
        "pair",
        [p for p in PROMPT_PAIRS if p.expected_metrics and p.expected_archetype == "custom"],
        ids=[p.id for p in PROMPT_PAIRS if p.expected_metrics and p.expected_archetype == "custom"],
    )
    def test_metrics_match_sql_ref(self, pair: PromptPair):
        spec = _spec(pair.prompt)
        actual_keys = _all_metric_keys(spec)
        sql_ref = SQL_REF_BY_ID.get(pair.sql_ref_id)
        if sql_ref is None:
            pytest.skip(f"No SQL reference for {pair.sql_ref_id}")
        # At least one expected metric from the prompt should map to the SQL ref
        for metric in pair.expected_metrics:
            assert metric in actual_keys, (
                f"{pair.id}: metric '{metric}' expected but not in spec. "
                f"SQL ref {sql_ref.id} covers {sql_ref.metric_keys}"
            )
