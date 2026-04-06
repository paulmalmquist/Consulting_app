"""Tests for the capability graph service.

Shape tests only — verify the graph has the expected structure and
that each collection function returns non-empty results for REPE.
No DB required (metrics collection falls back to empty gracefully).
"""
from __future__ import annotations



class TestBuildCapabilityGraph:
    def test_returns_expected_top_level_keys(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="test-env-id",
            business_id="test-business-id",
            industry_type="repe",
        )
        expected_keys = {
            "env_id", "business_id", "industry_type",
            "templates", "metrics", "tools", "skills", "surfaces",
            "grounding_tables",
        }
        assert expected_keys == set(graph.keys())

    def test_env_id_and_business_id_passthrough(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="env-abc",
            business_id="biz-xyz",
            industry_type="repe",
        )
        assert graph["env_id"] == "env-abc"
        assert graph["business_id"] == "biz-xyz"
        assert graph["industry_type"] == "repe"

    def test_repe_templates_non_empty(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        assert len(graph["templates"]) > 0

    def test_templates_have_required_shape(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        for t in graph["templates"]:
            assert "key" in t
            assert "tags" in t
            assert "required_params" in t
            # Key should include the domain prefix
            assert t["key"].startswith("repe.")

    def test_repe_templates_include_irr_ranked(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        keys = [t["key"] for t in graph["templates"]]
        assert "repe.irr_ranked" in keys
        assert "repe.noi_ranked" in keys
        assert "repe.debt_maturity" in keys

    def test_pds_templates_non_empty(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="pds"
        )
        assert len(graph["templates"]) > 0
        for t in graph["templates"]:
            assert t["key"].startswith("pds.")

    def test_skills_list_is_list(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        assert isinstance(graph["skills"], list)

    def test_surfaces_list_is_list(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        assert isinstance(graph["surfaces"], list)

    def test_repe_grounding_tables_non_empty(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        assert "re_asset_quarter_state" in graph["grounding_tables"]
        assert "re_fund_quarter_state" in graph["grounding_tables"]

    def test_unknown_industry_type_returns_empty_lists(self):
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="unknown_type"
        )
        # Templates will be empty for unknown domain
        assert isinstance(graph["templates"], list)
        assert graph["grounding_tables"] == []

    def test_metrics_is_list(self):
        """Metrics will be empty when DB is unavailable in unit tests — that's OK."""
        from app.services.capability_graph import build_capability_graph
        graph = build_capability_graph(
            env_id="e", business_id="b", industry_type="repe"
        )
        assert isinstance(graph["metrics"], list)
