from datetime import date

from app.services.resume_workspace import (
    build_resume_workspace_payload,
    generate_resume_assistant_response,
)


def _sample_roles():
    return [
        {
            "role_id": "role-jll-1",
            "company": "JLL",
            "title": "Senior Analyst, Data Engineering & Analytics",
            "start_date": "2014-08-01",
            "end_date": "2018-01-31",
            "summary": "Built the JLL/JPMC BI foundation.",
            "highlights": ["Built the first BI service line"],
            "technologies": ["SQL", "Tableau"],
            "sort_order": 1,
        },
        {
            "role_id": "role-kayne",
            "company": "Kayne Anderson Real Estate",
            "title": "Vice President, Data Platform Engineering & FP&A",
            "start_date": "2018-02-01",
            "end_date": "2025-03-31",
            "summary": "Built the Kayne data platform, semantic layer, and waterfall engine.",
            "highlights": ["Built the warehouse", "Reduced DDQ response time"],
            "technologies": ["Databricks", "Power BI", "Python"],
            "sort_order": 2,
        },
        {
            "role_id": "role-jll-2",
            "company": "JLL",
            "title": "Director, AI Data Platform & Analytics",
            "start_date": "2025-04-01",
            "end_date": None,
            "summary": "Returned to JLL to build the AI analytics platform.",
            "highlights": ["Built AI-enabled analytics platform"],
            "technologies": ["Databricks", "OpenAI API"],
            "sort_order": 3,
        },
    ]


def _sample_phases():
    return [
        {
            "phase_id": "phase-jll-2014-2018",
            "company": "JLL",
            "phase_name": "JLL (2014-2018)",
            "start_date": "2014-08-01",
            "end_date": "2018-01-31",
            "description": "Reporting foundation and BI service line.",
            "band_color": "#0F766E",
            "overlay_only": False,
            "display_order": 1,
        },
        {
            "phase_id": "phase-kayne-2018-2025",
            "company": "Kayne Anderson",
            "phase_name": "Kayne Anderson (2018-2025)",
            "start_date": "2018-02-01",
            "end_date": "2025-03-31",
            "description": "Warehouse, automation, semantic layer, and waterfall systems.",
            "band_color": "#1D4ED8",
            "overlay_only": False,
            "display_order": 2,
        },
        {
            "phase_id": "phase-jll-2025-present",
            "company": "JLL",
            "phase_name": "JLL (2025-present)",
            "start_date": "2025-04-01",
            "end_date": None,
            "description": "AI analytics platform and governed operating system.",
            "band_color": "#7C3AED",
            "overlay_only": False,
            "display_order": 3,
        },
    ]


def _sample_layers():
    return [
        {
            "layer_id": "data_platform",
            "name": "Data Platform / Warehouse",
            "color": "#14B8A6",
            "description": "Warehouse foundation",
            "sort_order": 1,
            "is_visible": True,
        },
        {
            "layer_id": "ai_agentic",
            "name": "AI / Agentic Systems",
            "color": "#A855F7",
            "description": "AI execution layer",
            "sort_order": 2,
            "is_visible": True,
        },
    ]


def _sample_milestones():
    return [
        {
            "milestone_id": "milestone-joined-jll-2014",
            "phase_id": "phase-jll-2014-2018",
            "title": "Joined JLL / reporting foundation",
            "date": "2014-08-01",
            "type": "transition",
            "summary": "Started the first public JLL phase.",
            "importance": 80,
            "play_order": 1,
            "capability_tags": ["data_platform"],
        },
        {
            "milestone_id": "milestone-kayne-warehouse-semantic",
            "phase_id": "phase-kayne-2018-2025",
            "title": "Kayne warehouse + semantic layer",
            "date": "2023-07-01",
            "type": "build",
            "summary": "Warehouse and semantic model became the operating backbone.",
            "importance": 95,
            "play_order": 2,
            "capability_tags": ["data_platform"],
            "metrics_json": {"ddq_turnaround": 50},
        },
        {
            "milestone_id": "milestone-rejoined-jll-2025",
            "phase_id": "phase-jll-2025-present",
            "title": "Rejoined JLL in 2025 / AI analytics platform",
            "date": "2025-04-01",
            "type": "transition",
            "summary": "Returned to JLL with the compounded playbook.",
            "importance": 90,
            "play_order": 3,
            "capability_tags": ["ai_agentic"],
        },
    ]


def _sample_metric_anchors():
    return [
        {
            "anchor_id": "anchor-properties-integrated",
            "hero_metric_key": "properties_integrated",
            "title": "500+ properties integrated",
            "default_view": "impact",
            "linked_phase_ids": ["phase-kayne-2018-2025"],
            "linked_milestone_ids": ["milestone-kayne-warehouse-semantic"],
            "linked_capability_layer_ids": ["data_platform"],
            "narrative_hint": "Warehouse scale became visible proof.",
            "sort_order": 1,
        },
        {
            "anchor_id": "anchor-ai-tool-surface",
            "hero_metric_key": "ai_tool_surface",
            "title": "83 MCP tools and AI execution layer",
            "default_view": "capability",
            "linked_phase_ids": ["phase-jll-2025-present"],
            "linked_milestone_ids": ["milestone-rejoined-jll-2025"],
            "linked_capability_layer_ids": ["ai_agentic"],
            "narrative_hint": "AI proof point aligns to the 2025 JLL return.",
            "sort_order": 2,
        },
    ]


def test_build_resume_workspace_payload_shapes_sections():
    payload = build_resume_workspace_payload(
        summary={"location": "Lake Worth, FL"},
        stats={},
        roles=[],
        projects=[],
        components=[],
        deployments=[],
    )

    assert payload["identity"]["name"] == "Paul Malmquist"
    assert payload["timeline"]["default_view"] == "career"
    assert payload["architecture"]["default_view"] == "technical"
    assert payload["modeling"]["presets"][0]["preset_id"] == "base_case"
    assert payload["bi"]["root_entity_id"] == "portfolio-root"
    assert payload["stories"]


def test_build_resume_workspace_payload_preserves_public_timeline_boundaries_and_metric_anchors():
    payload = build_resume_workspace_payload(
        summary={"location": "Lake Worth, FL"},
        stats={},
        roles=_sample_roles(),
        projects=[],
        components=[],
        deployments=[],
        phases=_sample_phases(),
        capability_layers=_sample_layers(),
        initiatives=[],
        milestones=_sample_milestones(),
        accomplishment_cards=[],
        metric_anchors=_sample_metric_anchors(),
    )

    phases = payload["timeline"]["phases"]
    assert [phase["start_date"] for phase in phases] == [
        "2014-08-01",
        "2018-02-01",
        "2025-04-01",
    ]
    assert phases[0]["end_date"] == "2018-01-31"
    assert phases[1]["end_date"] == "2025-03-31"
    assert phases[2]["end_date"] is None

    for left, right in zip(phases, phases[1:]):
        left_end = date.fromisoformat(left["end_date"])
        right_start = date.fromisoformat(right["start_date"])
        assert left_end < right_start

    assert payload["timeline"]["roles"][0]["start_date"] == "2014-08-01"
    assert payload["timeline"]["roles"][-1]["start_date"] == "2025-04-01"
    assert payload["timeline"]["start_date"] == "2014-08-01"

    phase_ids = {phase["phase_id"] for phase in phases}
    milestone_ids = {milestone["milestone_id"] for milestone in payload["timeline"]["milestones"]}
    layer_ids = {layer["layer_id"] for layer in payload["timeline"]["capability_layers"]}

    for anchor in payload["timeline"]["metric_anchors"]:
        assert set(anchor["linked_phase_ids"]).issubset(phase_ids)
        assert set(anchor["linked_milestone_ids"]).issubset(milestone_ids)
        assert set(anchor["linked_capability_layer_ids"]).issubset(layer_ids)


def test_generate_resume_assistant_response_uses_module_context():
    workspace = build_resume_workspace_payload(
        summary={"location": "Lake Worth, FL"},
        stats={},
        roles=[],
        projects=[],
        components=[],
        deployments=[],
    )

    response = generate_resume_assistant_response(
        workspace=workspace,
        query="Explain this waterfall",
        context={
            "active_module": "modeling",
            "model_preset_id": "base_case",
            "metrics": {
                "irr": "18.4%",
                "tvpi": "1.92x",
                "lp_distribution": "$72M",
                "gp_distribution": "$18M",
            },
        },
    )

    assert response["blocks"][0]["type"] == "markdown_text"
    assert any(block["type"] == "kpi_group" for block in response["blocks"])
    assert response["suggested_questions"]
