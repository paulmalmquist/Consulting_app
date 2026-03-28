from app.services.resume_workspace import (
    build_resume_workspace_payload,
    generate_resume_assistant_response,
)


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
