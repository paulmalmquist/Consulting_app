from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from app.mcp.registry import registry
from app.routes import agent_builder as agent_builder_route
from app.schemas.agent_builder import AgentGraph, AgentNode
from app.services import agent_builder
from app.services import agent_builder_evals
from app.services.ai_dispatch.models import (
    DispatchResult,
    DispatchStatus,
    ProviderName,
    Usage,
)


ENV = "agent-builder-test"
BIZ = str(uuid4())


def graph(nodes: list[dict], edges: list[dict], **limits) -> AgentGraph:
    return AgentGraph.model_validate(
        {
            "schema_version": "agent-graph/v1",
            "nodes": nodes,
            "edges": edges,
            "limits": {
                "max_runtime_seconds": limits.get("max_runtime_seconds", 120),
                "max_tool_calls": limits.get("max_tool_calls", 10),
                "max_cost_usd": limits.get("max_cost_usd", 1),
            },
            "model_route_policy": {"sensitive_fallback": "fail_closed"},
        }
    )


def node(node_id: str, node_type: str, x: int, config=None) -> dict:
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": x, "y": 0},
        "config": config or {},
    }


def edge(source: str, target: str, handle: str | None = None) -> dict:
    return {"source": source, "target": target, "source_handle": handle}


def valid_minimal_graph() -> AgentGraph:
    return graph(
        [node("trigger", "manual_trigger", 0), node("output", "output", 200)],
        [edge("trigger", "output")],
    )


def test_graph_lint_detects_cycle_unreachable_and_missing_terminal():
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0),
            node("context", "context_loader", 100),
            node("orphan", "receipt_writer", 100),
            node("output", "output", 200),
        ],
        [
            edge("trigger", "context"),
            edge("context", "trigger"),
            edge("context", "output"),
        ],
    )
    result = agent_builder.validate_graph(candidate)
    codes = {issue["code"] for issue in result["issues"]}
    assert result["status"] == "fail"
    assert {"CYCLE", "TRIGGER_INCOMING", "UNREACHABLE_NODE", "MISSING_TERMINAL_PATH"} <= codes


def test_secret_shaped_workflow_data_is_rejected():
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0, {"api_key": "sk-secret-value-123456"}),
            node("output", "output", 200),
        ],
        [edge("trigger", "output")],
    )
    result = agent_builder.validate_graph(candidate)
    assert any(issue["code"] == "SECRET_DETECTED" for issue in result["issues"])
    assert agent_builder.redact_payload({"authorization": "Bearer abcdefghijklmnop"}) == {
        "authorization": "[REDACTED]"
    }


def test_write_capable_tool_is_disabled_and_rejected():
    write_tool = registry.get("business.create")
    assert write_tool is not None and write_tool.permission == "write"
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0),
            node(
                "tool",
                "mcp_tool",
                100,
                {
                    "tool_name": write_tool.name,
                    "tool_schema_digest": agent_builder.tool_schema_digest(write_tool),
                    "bindings": {},
                },
            ),
            node("output", "output", 200),
        ],
        [edge("trigger", "tool"), edge("tool", "output")],
    )
    result = agent_builder.validate_graph(candidate)
    assert any(issue["code"] == "WRITE_TOOL_FORBIDDEN" for issue in result["issues"])
    described = next(tool for tool in agent_builder.describe_tools() if tool["name"] == write_tool.name)
    assert described["enabled"] is False


def test_tool_schema_digest_drift_fails_closed():
    read_tool = registry.get("telemetry.preview_score_window")
    assert read_tool is not None
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0),
            node(
                "tool",
                "mcp_tool",
                100,
                {
                    "tool_name": read_tool.name,
                    "tool_schema_digest": "stale",
                    "bindings": {},
                },
            ),
            node("output", "output", 200),
        ],
        [edge("trigger", "tool"), edge("tool", "output")],
    )
    result = agent_builder.validate_graph(candidate)
    assert any(issue["code"] == "SCHEMA_DIGEST_DRIFT" for issue in result["issues"])


def test_policy_and_cost_nodes_require_typed_branch_handles():
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0),
            node("policy", "policy_gate", 100, {"policy": "read_only_only"}),
            node("cost", "cost_guardrail", 200),
            node("output", "output", 300),
        ],
        [
            edge("trigger", "policy"),
            edge("policy", "cost"),
            edge("cost", "output"),
        ],
    )
    result = agent_builder.validate_graph(candidate)
    codes = {issue["code"] for issue in result["issues"]}
    assert {"GATE_HANDLES", "COST_HANDLES"} <= codes


def test_policy_cost_and_approval_nodes_emit_deterministic_runtime_states():
    candidate = valid_minimal_graph()
    policy = agent_builder._execute_node(
        node=AgentNode.model_validate(
            node("policy", "policy_gate", 100, {"policy": "require_input", "required_input": "input.allowed"})
        ),
        graph=candidate,
        run_input={"allowed": False},
        outputs={},
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        accumulated_cost=0,
        run_id="run-policy",
    )
    assert policy.status == "warning"
    assert policy.branch_handle == "fail"

    cost = agent_builder._execute_node(
        node=AgentNode.model_validate(
            node("cost", "cost_guardrail", 100, {"max_cost_usd": 1, "estimated_next_cost_usd": 2})
        ),
        graph=candidate,
        run_input={},
        outputs={},
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        accumulated_cost=0,
        run_id="run-cost",
    )
    assert cost.status == "warning"
    assert cost.branch_handle == "over_budget"

    approval = agent_builder._execute_node(
        node=AgentNode.model_validate(node("approval", "human_approval", 100)),
        graph=candidate,
        run_input={},
        outputs={},
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        accumulated_cost=0,
        run_id="run-approval",
    )
    assert approval.status == "blocked"
    assert approval.output["approval_status"] == "simulated_pending"


def test_prompt_node_uses_live_dispatch_contract_and_strict_json(monkeypatch):
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", True)
    captured = {}

    def fake_dispatch(request, **kwargs):
        captured["request"] = request
        captured["registry"] = kwargs.get("registry")
        return DispatchResult(
            request_id="dispatch-1",
            status=DispatchStatus.SUCCESS,
            provider=ProviderName.OPENAI,
            model="mock-model",
            answer='{"verdict":"GO"}',
            usage=Usage(prompt_tokens=10, completion_tokens=5),
        )

    monkeypatch.setattr(agent_builder, "run_dispatch", fake_dispatch)
    candidate = valid_minimal_graph()
    prompt = AgentNode.model_validate(
        node(
            "prompt",
            "prompt_llm",
            100,
            {
                "prompt_template": "Assess {{input.question}}",
                "prompt_version": "triage/v1",
                "mode": "classification",
                "privacy": "internal",
                "output_schema": {
                    "type": "object",
                    "properties": {"verdict": {"enum": ["GO", "NO_GO"]}},
                    "required": ["verdict"],
                    "additionalProperties": False,
                },
            },
        )
    )
    result = agent_builder._execute_node(
        node=prompt,
        graph=candidate,
        run_input={"question": "window"},
        outputs={},
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        accumulated_cost=0,
        run_id="run-1",
    )
    assert result.status == "completed"
    assert result.output == {"verdict": "GO"}
    assert captured["request"].business_id == BIZ


def test_prompt_schema_mismatch_fails_without_claiming_success(monkeypatch):
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", True)
    monkeypatch.setattr(
        agent_builder,
        "run_dispatch",
        lambda request, **kwargs: DispatchResult(
            request_id="dispatch-bad",
            status=DispatchStatus.SUCCESS,
            provider=ProviderName.OPENAI,
            model="mock-model",
            answer='{"unsupported":"claim"}',
        ),
    )
    prompt = AgentNode.model_validate(
        node(
            "prompt",
            "prompt_llm",
            100,
            {
                "prompt_template": "Return a verdict",
                "prompt_version": "triage/v1",
                "mode": "classification",
                "privacy": "internal",
                "output_schema": {
                    "type": "object",
                    "properties": {"verdict": {"type": "string"}},
                    "required": ["verdict"],
                    "additionalProperties": False,
                },
            },
        )
    )
    result = agent_builder._execute_node(
        node=prompt,
        graph=valid_minimal_graph(),
        run_input={},
        outputs={},
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        accumulated_cost=0,
        run_id="run-bad-schema",
    )
    assert result.status == "failed"
    assert result.reason.startswith("output_schema_validation_failed")


def test_sensitive_prompt_forces_private_tier_without_fallback(monkeypatch):
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", True)
    captured = {}

    def fake_dispatch(request, **kwargs):
        captured["request"] = request
        captured["registry"] = kwargs.get("registry")
        return DispatchResult(
            request_id="dispatch-2",
            status=DispatchStatus.UNAVAILABLE,
            routing_reason="private tier unavailable",
            rejected={"openai": "privacy_forbidden"},
        )

    monkeypatch.setattr(agent_builder, "run_dispatch", fake_dispatch)
    prompt = AgentNode.model_validate(
        node(
            "prompt",
            "prompt_llm",
            100,
            {
                "prompt_template": "Classify sensitive input",
                "prompt_version": "private/v1",
                "mode": "classification",
                "privacy": "sensitive",
                "output_schema": {"type": "object"},
            },
        )
    )
    result = agent_builder._execute_node(
        node=prompt,
        graph=valid_minimal_graph(),
        run_input={},
        outputs={},
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        accumulated_cost=0,
        run_id="run-2",
    )
    assert result.status == "not_available"
    assert captured["request"].forced_provider == ProviderName.GEMMA_GCP
    assert captured["request"].allow_fallback is False
    assert captured["registry"] is not None


def test_prompt_budget_blocks_before_provider_call(monkeypatch):
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", True)
    dispatch = patch.object(agent_builder, "run_dispatch")
    mocked = dispatch.start()
    try:
        prompt = AgentNode.model_validate(
            node(
                "prompt",
                "prompt_llm",
                100,
                {
                    "prompt_template": "bounded",
                    "prompt_version": "v1",
                    "mode": "classification",
                    "privacy": "internal",
                    "estimated_cost_usd": 2,
                    "output_schema": {"type": "object"},
                },
            )
        )
        result = agent_builder._execute_node(
            node=prompt,
            graph=graph(
                [node("trigger", "manual_trigger", 0), node("output", "output", 200)],
                [edge("trigger", "output")],
                max_cost_usd=1,
            ),
            run_input={},
            outputs={},
            env_id=ENV,
            business_id=BIZ,
            actor="operator",
            accumulated_cost=0,
            run_id="run-3",
        )
        assert result.status == "blocked"
        mocked.assert_not_called()
    finally:
        dispatch.stop()


def test_templates_include_six_demo_and_ten_governed_drafts():
    templates = agent_builder.template_graphs()
    assert len(templates) == 16
    assert templates[0]["key"] == "telemetry-triage"
    governed = templates[6:]
    assert [template["key"] for template in governed] == [
        "governed-ticket-intake",
        "governed-analytics-engineer",
        "governed-bigquery-sql",
        "governed-data-quality",
        "governed-looker-dashboard",
        "governed-rag-knowledge",
        "governed-ci-cd-evidence",
        "governed-cost-watchdog",
        "governed-release-notes",
        "governed-executive-summary",
    ]
    assert [template["name"] for template in governed] == [
        "Ticket Intake Agent",
        "Analytics Engineer Agent",
        "BigQuery SQL Agent",
        "Data Quality Agent",
        "Looker Dashboard Agent",
        "RAG Knowledge Agent",
        "CI/CD Evidence Agent",
        "Cost Watchdog Agent",
        "Release Notes Agent",
        "Executive Summary Agent",
    ]
    assert len({template["key"] for template in templates}) == 16
    results = [
        agent_builder.validate_graph(AgentGraph.model_validate(template["graph"]))["status"]
        for template in templates
    ]
    assert results == ["pass"] * 16


def test_governed_templates_are_zero_tool_fail_closed_graphs():
    for template in agent_builder.template_graphs()[6:]:
        candidate = AgentGraph.model_validate(template["graph"])
        assert candidate.limits.max_tool_calls == 0
        assert candidate.limits.max_cost_usd == 0
        assert not any(node.type == "mcp_tool" for node in candidate.nodes)
        approval = next(node for node in candidate.nodes if node.type == "human_approval")
        assert "not registered" in approval.config["reason"]
        output = next(node for node in candidate.nodes if node.type == "output")
        assert output.config["bindings"]["status"] == "NOT_AVAILABLE"


def test_seed_templates_is_idempotent_when_catalog_already_exists(monkeypatch):
    template_keys = [template["key"] for template in agent_builder.template_graphs()]

    class ExistingTemplatesCursor:
        def execute(self, *_args, **_kwargs):
            return None

        def fetchall(self):
            return [{"template_key": key} for key in template_keys]

    @contextmanager
    def existing_templates_cursor():
        yield ExistingTemplatesCursor()

    monkeypatch.setattr(agent_builder, "get_cursor", existing_templates_cursor)
    create = patch.object(agent_builder, "create_workflow")
    mocked = create.start()
    try:
        agent_builder.seed_templates(env_id=ENV, business_id=BIZ, actor="seed")
        mocked.assert_not_called()
    finally:
        create.stop()


def test_deterministic_eval_suite_is_staged_ready_for_valid_read_only_graph():
    cases = [
        {"id": f"case-{eval_class}", **agent_builder_evals._default_case(eval_class)}
        for eval_class in agent_builder_evals.ALL_CLASSES
    ]
    results = agent_builder_evals.evaluate_cases(valid_minimal_graph(), cases)
    summary = agent_builder_evals.summarize_results(results)
    assert summary["overall_status"] == "staged_ready"
    assert summary["by_class"]["graph_lint"] == "pass"
    assert summary["by_class"]["visual_smoke"] == "not_applicable"
    assert summary["by_class"]["production_smoke"] == "not_applicable"


def test_promoted_regression_blocks_until_matching_successful_replay_exists():
    case = {
        "id": "regression-case",
        "case_key": "regression-memory-1",
        "eval_class": "regression",
        "title": "Promoted failure",
        "input_json": {"run_key": "failed-run"},
        "expected_json": {"terminal_status": "succeeded"},
        "source": "promoted_failure",
    }
    blocked = agent_builder_evals.evaluate_cases(valid_minimal_graph(), [case])
    assert blocked[0]["status"] == "fail"
    assert "matching successful dry-run" in blocked[0]["failed_assertion"]

    passing = agent_builder_evals.evaluate_cases(
        valid_minimal_graph(),
        [case],
        regression_evidence={"regression-case": "run-success"},
    )
    assert passing[0]["status"] == "pass"
    assert passing[0]["trace_run_id"] == "run-success"


def test_eval_migration_has_tenant_rls_and_append_only_guards():
    migration = (
        Path(__file__).resolve().parents[2]
        / "repo-b"
        / "db"
        / "schema"
        / "10036_agent_builder_evals.sql"
    )
    sql = migration.read_text(encoding="utf-8").lower()
    for table in (
        "ai_agent_eval_suites",
        "ai_agent_eval_cases",
        "ai_agent_eval_runs",
        "ai_agent_eval_results",
        "ai_agent_failure_memory",
    ):
        assert f"create table if not exists {table}" in sql
        assert table in sql
    assert sql.count("enable row level security") >= 5
    assert "ai_agent_eval_results_append_only" in sql
    assert "ai_agent_failure_memory_append_only" in sql
    assert "published_by" in sql and "publish_blockers" in sql


def test_permission_eval_rejects_write_tool_even_if_graph_was_tampered():
    write_tool = registry.get("business.create")
    assert write_tool is not None
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0),
            node(
                "tool",
                "mcp_tool",
                100,
                {
                    "tool_name": write_tool.name,
                    "tool_schema_digest": agent_builder.tool_schema_digest(write_tool),
                },
            ),
            node("output", "output", 200),
        ],
        [edge("trigger", "tool"), edge("tool", "output")],
    )
    case = {
        "id": "permission-case",
        **agent_builder_evals._default_case("permission"),
    }
    result = agent_builder_evals.evaluate_cases(candidate, [case])[0]
    assert result["status"] == "fail"
    assert result["actual_json"]["violations"][0]["reason"] == "non_read_tool"


def test_agent_builder_api_requires_tenant_and_exposes_palette(client):
    assert client.get("/api/agent-builder/palette").status_code == 403
    response = client.get(
        "/api/agent-builder/palette",
        headers={
            "x-bm-auth-provider": "platform-session",
            "x-bm-user-id": "user-1",
            "x-bm-actor": "user:test:user-1",
            "x-bm-env-id": ENV,
            "x-bm-business-id": BIZ,
            "x-bm-membership-role": "member",
        },
    )
    assert response.status_code == 200
    assert len(response.json()["nodes"]) == 10


def _platform_headers(role: str = "member") -> dict[str, str]:
    return {
        "x-bm-auth-provider": "platform-session",
        "x-bm-user-id": "user-1",
        "x-bm-actor": "user:test:user-1",
        "x-bm-env-id": ENV,
        "x-bm-business-id": BIZ,
        "x-bm-membership-role": role,
    }


def test_agent_builder_api_enforces_viewer_vs_operator_mutations(client, monkeypatch):
    payload = {"name": "Agent", "graph": valid_minimal_graph().model_dump(mode="json")}
    monkeypatch.setattr(
        agent_builder_route.service,
        "create_workflow",
        lambda **kwargs: {"id": "workflow-1", "version_number": 1},
    )
    assert client.post("/api/agent-builder/workflows", headers=_platform_headers("viewer"), json=payload).status_code == 403
    response = client.post("/api/agent-builder/workflows", headers=_platform_headers("member"), json=payload)
    assert response.status_code == 200
    assert response.json()["version_number"] == 1


def test_agent_builder_api_save_validate_and_dry_run_contracts(client, monkeypatch):
    monkeypatch.setattr(
        agent_builder_route.service,
        "save_draft",
        lambda **kwargs: {"id": kwargs["workflow_id"], "version_number": kwargs["base_version_number"] + 1},
    )
    monkeypatch.setattr(
        agent_builder_route.service,
        "validate_saved_workflow",
        lambda **kwargs: {"status": "pass", "issues": [], "checks": {}, "topological_order": ["trigger", "output"]},
    )
    monkeypatch.setattr(
        agent_builder_route.service,
        "dry_run",
        lambda **kwargs: {"id": "run-1", "status": "succeeded", "steps": [], "receipts": []},
    )
    headers = _platform_headers("member")
    saved = client.patch(
        "/api/agent-builder/workflows/workflow-1/draft",
        headers=headers,
        json={"base_version_number": 1, "graph": valid_minimal_graph().model_dump(mode="json")},
    )
    assert saved.status_code == 200
    assert saved.json()["version_number"] == 2
    assert client.post("/api/agent-builder/workflows/workflow-1/validate", headers=headers).json()["status"] == "pass"
    run = client.post(
        "/api/agent-builder/workflows/workflow-1/dry-run",
        headers=headers,
        json={"input": {"run_key": "run-1"}},
    )
    assert run.status_code == 200
    assert run.json()["status"] == "succeeded"


def test_agent_builder_api_eval_publish_and_failure_promotion_contracts(client, monkeypatch):
    monkeypatch.setattr(
        agent_builder_route.eval_service,
        "run_evals",
        lambda **kwargs: {"id": "eval-run-1", "overall_status": "staged_ready"},
    )
    monkeypatch.setattr(
        agent_builder_route.eval_service,
        "get_workflow_evals",
        lambda **kwargs: {"id": "eval-run-1", "overall_status": "staged_ready"},
    )
    monkeypatch.setattr(
        agent_builder_route.eval_service,
        "get_eval_run",
        lambda **kwargs: {"id": kwargs["eval_run_id"], "overall_status": "staged_ready"},
    )
    monkeypatch.setattr(
        agent_builder_route.eval_service,
        "publish_workflow",
        lambda **kwargs: {"id": kwargs["workflow_id"], "status": kwargs["desired_status"]},
    )
    monkeypatch.setattr(
        agent_builder_route.eval_service,
        "promote_failure",
        lambda **kwargs: {"source_run_id": kwargs["run_id"], "already_promoted": False},
    )
    headers = _platform_headers("member")
    assert client.post(
        "/api/agent-builder/workflows/workflow-1/evals/run", headers=headers
    ).json()["overall_status"] == "staged_ready"
    assert client.get(
        "/api/agent-builder/workflows/workflow-1/evals", headers=headers
    ).status_code == 200
    assert client.get(
        "/api/agent-builder/eval-runs/eval-run-1", headers=headers
    ).status_code == 200
    assert client.post(
        "/api/agent-builder/workflows/workflow-1/publish",
        headers=headers,
        json={"status": "staged"},
    ).json()["status"] == "staged"
    assert client.post(
        "/api/agent-builder/runs/run-1/promote-failure", headers=headers
    ).json()["source_run_id"] == "run-1"


def test_production_publish_request_fails_closed(client, monkeypatch):
    monkeypatch.setattr(
        agent_builder_route.eval_service,
        "publish_workflow",
        lambda **kwargs: (_ for _ in ()).throw(
            ValueError("Production publication is deferred")
        ),
    )
    response = client.post(
        "/api/agent-builder/workflows/workflow-1/publish",
        headers=_platform_headers("member"),
        json={"status": "published"},
    )
    assert response.status_code == 400
    assert "deferred" in response.json()["detail"]


class EvalCursor:
    def __init__(self):
        self.current = ""
        self.eval_result_count = 0
        self.queries: list[str] = []
        self.cases = [
            {
                "id": f"case-{eval_class}",
                **agent_builder_evals._default_case(eval_class),
                "created_at": None,
            }
            for eval_class in agent_builder_evals.ALL_CLASSES
        ]

    def execute(self, sql, params=None):
        self.current = " ".join(sql.split())
        self.queries.append(self.current)
        if "INSERT INTO ai_agent_eval_results" in self.current:
            self.eval_result_count += 1
        return self

    def fetchone(self):
        if "INSERT INTO ai_agent_eval_suites" in self.current:
            return {"id": "suite-1"}
        if "INSERT INTO ai_agent_eval_runs" in self.current:
            return {"id": "eval-run-1"}
        if "FROM ai_agent_eval_runs er" in self.current:
            return {
                "id": "eval-run-1",
                "workflow_id": "workflow-1",
                "workflow_version_id": "version-1",
                "workflow_name": "Agent",
                "version_number": 1,
                "status": "completed",
                "overall_status": "staged_ready",
                "summary_json": {
                    "overall_status": "staged_ready",
                    "by_class": {},
                    "blockers": [],
                },
            }
        return None

    def fetchall(self):
        if "FROM ai_agent_failure_memory" in self.current:
            return []
        if "FROM ai_agent_eval_cases" in self.current:
            return self.cases
        if "FROM ai_agent_eval_results" in self.current:
            return []
        return []


def test_eval_run_persists_one_append_only_result_per_case(monkeypatch):
    workflow = {
        "id": "workflow-1",
        "version_id": "version-1",
        "version_number": 1,
        "graph": valid_minimal_graph().model_dump(mode="json"),
    }
    cursor = EvalCursor()

    @contextmanager
    def fake_cursor():
        yield cursor

    monkeypatch.setattr(agent_builder_evals.agent_builder, "get_workflow", lambda **kwargs: workflow)
    monkeypatch.setattr(agent_builder_evals, "get_cursor", fake_cursor)
    result = agent_builder_evals.run_evals(
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        workflow_id="workflow-1",
    )
    assert result["overall_status"] == "staged_ready"
    assert cursor.eval_result_count == len(agent_builder_evals.ALL_CLASSES)


def test_staged_publish_updates_only_after_current_version_is_ready(monkeypatch):
    workflow = {
        "id": "workflow-1",
        "version_id": "version-1",
        "version_number": 1,
        "graph": valid_minimal_graph().model_dump(mode="json"),
    }
    queries: list[str] = []

    class PublishCursor:
        def execute(self, sql, params=None):
            queries.append(" ".join(sql.split()))
            return self

    @contextmanager
    def fake_cursor():
        yield PublishCursor()

    monkeypatch.setattr(agent_builder_evals.agent_builder, "get_workflow", lambda **kwargs: workflow)
    monkeypatch.setattr(
        agent_builder_evals,
        "get_workflow_evals",
        lambda **kwargs: {
            "overall_status": "staged_ready",
            "summary_json": {"blockers": []},
        },
    )
    monkeypatch.setattr(agent_builder_evals, "get_cursor", fake_cursor)
    result = agent_builder_evals.publish_workflow(
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        workflow_id="workflow-1",
        desired_status="staged",
    )
    assert result["publish_readiness"]["overall_status"] == "staged_ready"
    assert any("publish_status='staged'" in sql for sql in queries)
    assert any("SET status='staged'" in sql for sql in queries)


def test_failure_promotion_rejects_secret_shaped_run_payload(monkeypatch):
    monkeypatch.setattr(
        agent_builder_evals.agent_builder,
        "get_run",
        lambda **kwargs: {
            "id": "run-1",
            "workflow_id": "workflow-1",
            "workflow_version_id": "version-1",
            "version_number": 1,
            "status": "failed",
            "input_json": {"api_key": "sk-secret-value-123456"},
            "output_json": {},
            "error_json": {},
        },
    )
    try:
        agent_builder_evals.promote_failure(
            env_id=ENV,
            business_id=BIZ,
            actor="operator",
            run_id="run-1",
        )
    except ValueError as exc:
        assert "secret-shaped" in str(exc)
    else:
        raise AssertionError("expected secret-bearing failure promotion to be rejected")


def test_save_draft_rejects_optimistic_version_conflict(monkeypatch):
    class ConflictCursor:
        def execute(self, sql, params=None):
            return self

        def fetchone(self):
            return {"version_number": 3}

    @contextmanager
    def fake_cursor():
        yield ConflictCursor()

    monkeypatch.setattr(agent_builder, "get_cursor", fake_cursor)
    try:
        agent_builder.save_draft(
            env_id=ENV,
            business_id=BIZ,
            actor="operator",
            workflow_id="workflow-1",
            base_version_number=2,
            graph=valid_minimal_graph(),
        )
    except agent_builder.VersionConflictError as exc:
        assert "current version is 3" in str(exc)
    else:
        raise AssertionError("expected VersionConflictError")


def test_compile_pins_records_prompt_and_tool_versions():
    tool = registry.get("telemetry.preview_score_window")
    assert tool is not None
    candidate = graph(
        [
            node("trigger", "manual_trigger", 0),
            node("tool", "mcp_tool", 100, {
                "tool_name": tool.name,
                "tool_schema_digest": agent_builder.tool_schema_digest(tool),
                "bindings": {},
            }),
            node("prompt", "prompt_llm", 200, {
                "prompt_template": "Bounded",
                "prompt_version": "bounded/v2",
                "output_schema": {"type": "object"},
            }),
            node("output", "output", 300),
        ],
        [edge("trigger", "tool"), edge("tool", "prompt"), edge("prompt", "output")],
    )
    pins = agent_builder.compile_pins(candidate)
    assert pins["prompt_versions"] == {"prompt": "bounded/v2"}
    assert pins["tool_schema_digests"]["tool"] == agent_builder.tool_schema_digest(tool)
    assert pins["required_permissions"] == ["read"]


class RuntimeCursor:
    """Small SQL-aware fake proving dry-run writes steps, events, and receipts."""

    def __init__(self, workflow: dict):
        self.workflow = workflow
        self.queries: list[str] = []
        self.current = ""
        self.step_count = 0
        self.receipt_count = 0
        self.event_count = 0
        self.steps: list[dict] = []
        self.receipts: list[dict] = []

    def execute(self, sql, params=None):
        self.current = " ".join(sql.split())
        self.queries.append(self.current)
        if "INSERT INTO ai_agent_run_steps" in self.current:
            self.step_count += 1
            self.steps.append(
                {
                    "id": f"step-{self.step_count}",
                    "node_id": params[3],
                    "node_type": params[4],
                    "status": params[5],
                    "receipt_id": None,
                }
            )
        elif "INSERT INTO ai_agent_receipts" in self.current:
            self.receipt_count += 1
            self.receipts.append(
                {
                    "id": f"receipt-{self.receipt_count}",
                    "node_id": params[6],
                    "receipt_type": params[7],
                    "terminal_status": params[14],
                }
            )
        elif "INSERT INTO ai_agent_run_events" in self.current:
            self.event_count += 1
        return self

    def fetchone(self):
        if "FROM ai_agent_workflows w JOIN ai_agent_workflow_versions" in self.current:
            return self.workflow
        if "INSERT INTO ai_agent_runs" in self.current:
            return {"id": "run-1"}
        if "INSERT INTO ai_agent_run_steps" in self.current:
            return {"id": f"step-{self.step_count}"}
        if "INSERT INTO ai_agent_receipts" in self.current:
            return {"id": f"receipt-{self.receipt_count}"}
        if "SELECT r.*, w.name AS workflow_name" in self.current:
            return {
                "id": "run-1",
                "workflow_id": "workflow-1",
                "workflow_version_id": "version-1",
                "workflow_name": "Test Agent",
                "version_number": 1,
                "status": "succeeded",
            }
        return None

    def fetchall(self):
        if "FROM ai_agent_workflow_versions" in self.current:
            return [{"id": "version-1", "version_number": 1}]
        if "FROM ai_agent_run_steps" in self.current:
            return self.steps
        if "FROM ai_agent_receipts" in self.current:
            return self.receipts
        return []


def test_dry_run_writes_step_events_and_receipts(monkeypatch):
    candidate = valid_minimal_graph()
    workflow = {
        "id": "workflow-1",
        "name": "Test Agent",
        "description": None,
        "owner_user_id": "operator",
        "status": "draft",
        "tags": [],
        "is_template": False,
        "template_key": None,
        "created_at": None,
        "updated_at": None,
        "version_id": "version-1",
        "version_number": 1,
        "graph_json": candidate.model_dump(mode="json"),
        "prompt_versions": {},
        "tool_schema_digests": {},
        "model_route_policy": {},
        "required_permissions": ["read"],
        "validation_status": "pass",
        "validation_results": agent_builder.validate_graph(candidate),
        "publish_status": "draft",
    }
    cursor = RuntimeCursor(workflow)

    @contextmanager
    def fake_cursor():
        yield cursor

    monkeypatch.setattr(agent_builder, "get_cursor", fake_cursor)
    result = agent_builder.dry_run(
        env_id=ENV,
        business_id=BIZ,
        actor="operator",
        workflow_id="workflow-1",
        run_input={"value": 1},
    )
    assert result["status"] == "succeeded"
    assert cursor.step_count == 2
    assert cursor.receipt_count == 2
    assert cursor.event_count == 6  # run start/end + before/after each step
