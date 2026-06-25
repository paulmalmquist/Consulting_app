"""Deterministic Agent Builder eval lifecycle and staged publish gate."""

from __future__ import annotations

from collections import Counter
from typing import Any
from uuid import uuid4

from psycopg.types.json import Json

from app.db import get_cursor
from app.mcp.registry import registry
from app.schemas.agent_builder import AgentGraph
from app.services import agent_builder


REQUIRED_STAGED_CLASSES = (
    "graph_lint",
    "tool_contract",
    "permission",
    "fail_closed",
    "cost",
    "regression",
    "replay_determinism",
)
OPTIONAL_CLASSES = ("rag_grounding", "visual_smoke", "production_smoke")
ALL_CLASSES = REQUIRED_STAGED_CLASSES + OPTIONAL_CLASSES

CLASS_LABELS = {
    "graph_lint": "Graph validation",
    "tool_contract": "Tool contracts",
    "permission": "Permission checks",
    "fail_closed": "Fail-closed behavior",
    "cost": "Cost guardrail",
    "regression": "Regression cases",
    "replay_determinism": "Replay determinism",
    "rag_grounding": "RAG grounding",
    "visual_smoke": "Visual smoke",
    "production_smoke": "Production smoke",
}


def _row(value: Any) -> dict[str, Any]:
    return agent_builder._row(value)


def _default_case(eval_class: str) -> dict[str, Any]:
    expectations = {
        "graph_lint": {"validation_status": "pass"},
        "tool_contract": {"registered": True, "schema_pins_current": True},
        "permission": {"read_only": True},
        "fail_closed": {"unsafe_fallbacks": 0},
        "cost": {"budgets_bounded": True},
        "regression": {"promoted_failures_recurred": 0},
        "replay_determinism": {"stable_plan": True},
        "rag_grounding": {"status": "not_applicable_without_rag_nodes"},
        "visual_smoke": {"status": "manual_evidence_required"},
        "production_smoke": {"status": "deferred_until_production_execution"},
    }
    return {
        "case_key": f"{eval_class}-default",
        "eval_class": eval_class,
        "title": CLASS_LABELS[eval_class],
        "input_json": {},
        "expected_json": expectations[eval_class],
        "source": "generated",
    }


def _result(
    case: dict[str, Any],
    status: str,
    actual: dict[str, Any],
    assertion: str | None = None,
    trace_run_id: str | None = None,
) -> dict[str, Any]:
    return {
        "eval_case_id": case["id"],
        "case_key": case["case_key"],
        "eval_class": case["eval_class"],
        "title": case["title"],
        "status": status,
        "input_json": case.get("input_json") or {},
        "expected_json": case.get("expected_json") or {},
        "actual_json": actual,
        "failed_assertion": assertion,
        "trace_run_id": trace_run_id,
    }


def evaluate_cases(
    graph: AgentGraph,
    cases: list[dict[str, Any]],
    *,
    regression_evidence: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Evaluate version-pinned cases without model or tool execution."""
    evidence = regression_evidence or {}
    validation = agent_builder.validate_graph(graph)
    results: list[dict[str, Any]] = []

    for case in cases:
        eval_class = case["eval_class"]
        if eval_class == "graph_lint":
            passed = validation["status"] == "pass"
            results.append(
                _result(
                    case,
                    "pass" if passed else "fail",
                    {"validation": validation},
                    None if passed else "Graph validation must pass.",
                )
            )
            continue

        if eval_class == "tool_contract":
            failures: list[dict[str, str]] = []
            for node in graph.nodes:
                if node.type != "mcp_tool":
                    continue
                tool_name = str(node.config.get("tool_name") or "")
                tool = registry.get(tool_name)
                if not tool:
                    failures.append({"node_id": node.id, "reason": "tool_not_registered"})
                elif node.config.get("tool_schema_digest") != agent_builder.tool_schema_digest(tool):
                    failures.append({"node_id": node.id, "reason": "schema_digest_drift"})
            results.append(
                _result(
                    case,
                    "pass" if not failures else "fail",
                    {"failures": failures, "tool_nodes": sum(node.type == "mcp_tool" for node in graph.nodes)},
                    None if not failures else "Every MCP node must resolve to its pinned registry schema.",
                )
            )
            continue

        if eval_class == "permission":
            violations: list[dict[str, str]] = []
            for node in graph.nodes:
                if node.type != "mcp_tool":
                    continue
                tool = registry.get(str(node.config.get("tool_name") or ""))
                manifest = tool.manifest() if tool else {}
                if (
                    not tool
                    or tool.permission != "read"
                    or manifest.get("permission_required") != "read"
                    or manifest.get("side_effect_class") != "read"
                ):
                    violations.append({"node_id": node.id, "reason": "non_read_tool"})
            results.append(
                _result(
                    case,
                    "pass" if not violations else "fail",
                    {"violations": violations},
                    None if not violations else "Staged workflows may only use effective read tools.",
                )
            )
            continue

        if eval_class == "fail_closed":
            violations: list[dict[str, str]] = []
            for node in graph.nodes:
                if node.type == "prompt_llm":
                    if not isinstance(node.config.get("output_schema"), dict):
                        violations.append({"node_id": node.id, "reason": "missing_output_schema"})
                    sensitive = node.config.get("privacy") == "sensitive" or bool(node.config.get("itar_tagged"))
                    if sensitive and bool(node.config.get("allow_fallback", False)):
                        violations.append({"node_id": node.id, "reason": "sensitive_external_fallback"})
            forbidden_codes = {
                "TOOL_NOT_AVAILABLE",
                "WRITE_TOOL_FORBIDDEN",
                "SCHEMA_DIGEST_DRIFT",
                "SECRET_DETECTED",
                "OUTPUT_SCHEMA_REQUIRED",
            }
            violations.extend(
                {"node_id": issue.get("node_id") or "", "reason": issue["code"]}
                for issue in validation["issues"]
                if issue["code"] in forbidden_codes
            )
            results.append(
                _result(
                    case,
                    "pass" if not violations else "fail",
                    {"violations": violations},
                    None if not violations else "Missing, unsafe, or unbounded capabilities must fail closed.",
                )
            )
            continue

        if eval_class == "cost":
            violations: list[dict[str, Any]] = []
            if graph.limits.max_runtime_seconds <= 0:
                violations.append({"scope": "graph", "reason": "runtime_unbounded"})
            if graph.limits.max_tool_calls < 0:
                violations.append({"scope": "graph", "reason": "tool_calls_unbounded"})
            if graph.limits.max_cost_usd < 0:
                violations.append({"scope": "graph", "reason": "cost_unbounded"})
            for node in graph.nodes:
                estimate = float(node.config.get("estimated_cost_usd") or 0)
                if node.type == "prompt_llm" and estimate > graph.limits.max_cost_usd:
                    violations.append(
                        {"node_id": node.id, "reason": "estimate_exceeds_run_budget", "estimate": estimate}
                    )
            results.append(
                _result(
                    case,
                    "pass" if not violations else "fail",
                    {"limits": graph.limits.model_dump(), "violations": violations},
                    None if not violations else "Every run and model call must remain inside configured limits.",
                )
            )
            continue

        if eval_class == "regression":
            if case.get("source") != "promoted_failure":
                results.append(_result(case, "pass", {"promoted_failures_recurred": 0}))
                continue
            trace_run_id = evidence.get(str(case["id"]))
            results.append(
                _result(
                    case,
                    "pass" if trace_run_id else "fail",
                    {"successful_replay_run_id": trace_run_id},
                    None if trace_run_id else "Promoted failure requires a matching successful dry-run on this version.",
                    trace_run_id=trace_run_id,
                )
            )
            continue

        if eval_class == "replay_determinism":
            first = {
                "order": agent_builder.topological_order(graph),
                "graph_hash": agent_builder.sha256_json(graph.model_dump(mode="json")),
                "pins": agent_builder.compile_pins(graph),
            }
            second = {
                "order": agent_builder.topological_order(graph),
                "graph_hash": agent_builder.sha256_json(graph.model_dump(mode="json")),
                "pins": agent_builder.compile_pins(graph),
            }
            passed = first == second
            results.append(
                _result(
                    case,
                    "pass" if passed else "fail",
                    {"first": first, "second": second},
                    None if passed else "Compilation must be deterministic for the immutable version.",
                )
            )
            continue

        if eval_class == "rag_grounding":
            results.append(
                _result(
                    case,
                    "not_applicable",
                    {"reason": "RAG node types are not available in agent-graph/v1."},
                )
            )
            continue

        if eval_class == "visual_smoke":
            results.append(
                _result(
                    case,
                    "not_applicable",
                    {"reason": "Authenticated browser evidence has not been attached to this eval run."},
                )
            )
            continue

        if eval_class == "production_smoke":
            results.append(
                _result(
                    case,
                    "not_applicable",
                    {"reason": "Production execution is disabled for the read-only MVP."},
                )
            )
            continue

        results.append(_result(case, "fail", {"reason": "unknown_eval_class"}, "Unknown eval class."))
    return results


def summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    by_class: dict[str, str] = {}
    for eval_class in ALL_CLASSES:
        statuses = [item["status"] for item in results if item["eval_class"] == eval_class]
        if not statuses:
            by_class[eval_class] = "not_applicable"
        elif "fail" in statuses:
            by_class[eval_class] = "fail"
        elif all(status == "not_applicable" for status in statuses):
            by_class[eval_class] = "not_applicable"
        else:
            by_class[eval_class] = "pass"
    blockers = [
        {"eval_class": eval_class, "reason": "required_eval_not_passing"}
        for eval_class in REQUIRED_STAGED_CLASSES
        if by_class.get(eval_class) != "pass"
    ]
    counts = Counter(item["status"] for item in results)
    return {
        "overall_status": "staged_ready" if not blockers else "blocked",
        "by_class": by_class,
        "blockers": blockers,
        "counts": {
            "pass": counts["pass"],
            "fail": counts["fail"],
            "not_applicable": counts["not_applicable"],
            "total": len(results),
        },
    }


def _ensure_suite(
    cur,
    *,
    env_id: str,
    business_id: str,
    actor: str,
    workflow: dict[str, Any],
) -> str:
    cur.execute(
        """INSERT INTO ai_agent_eval_suites
             (env_id,business_id,workflow_id,workflow_version_id,name,required_classes,created_by)
           VALUES (%s,%s,%s,%s,'Publish readiness',%s,%s)
           ON CONFLICT (workflow_version_id,name)
           DO UPDATE SET status='active'
           RETURNING id""",
        (
            env_id,
            business_id,
            workflow["id"],
            workflow["version_id"],
            list(REQUIRED_STAGED_CLASSES),
            actor,
        ),
    )
    suite_id = str(cur.fetchone()["id"])
    for eval_class in ALL_CLASSES:
        case = _default_case(eval_class)
        cur.execute(
            """INSERT INTO ai_agent_eval_cases
                 (env_id,business_id,suite_id,case_key,eval_class,title,input_json,expected_json,source)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (suite_id,case_key) DO NOTHING""",
            (
                env_id,
                business_id,
                suite_id,
                case["case_key"],
                case["eval_class"],
                case["title"],
                Json(case["input_json"]),
                Json(case["expected_json"]),
                case["source"],
            ),
        )
    cur.execute(
        """SELECT id, input_json, expected_behavior, source_run_id
           FROM ai_agent_failure_memory
           WHERE workflow_id=%s AND env_id=%s AND business_id=%s
           ORDER BY created_at""",
        (workflow["id"], env_id, business_id),
    )
    for memory in cur.fetchall():
        cur.execute(
            """INSERT INTO ai_agent_eval_cases
                 (env_id,business_id,suite_id,case_key,eval_class,title,input_json,expected_json,source)
               VALUES (%s,%s,%s,%s,'regression',%s,%s,%s,'promoted_failure')
               ON CONFLICT (suite_id,case_key) DO NOTHING""",
            (
                env_id,
                business_id,
                suite_id,
                f"regression-{memory['id']}",
                f"Promoted failure {memory['source_run_id']}",
                Json(memory["input_json"] or {}),
                Json(memory["expected_behavior"] or {}),
            ),
        )
    return suite_id


def run_evals(
    *,
    env_id: str,
    business_id: str,
    actor: str,
    workflow_id: str,
) -> dict[str, Any]:
    workflow = agent_builder.get_workflow(
        env_id=env_id, business_id=business_id, workflow_id=workflow_id
    )
    graph = AgentGraph.model_validate(workflow["graph"])
    with get_cursor() as cur:
        suite_id = _ensure_suite(
            cur,
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            workflow=workflow,
        )
        cur.execute(
            """SELECT * FROM ai_agent_eval_cases
               WHERE suite_id=%s AND env_id=%s AND business_id=%s AND active=true
               ORDER BY eval_class, created_at, case_key""",
            (suite_id, env_id, business_id),
        )
        cases = [_row(item) for item in cur.fetchall()]
        regression_evidence: dict[str, str] = {}
        for case in cases:
            if case["eval_class"] != "regression" or case["source"] != "promoted_failure":
                continue
            cur.execute(
                """SELECT id FROM ai_agent_runs
                   WHERE workflow_id=%s AND workflow_version_id=%s
                     AND env_id=%s AND business_id=%s
                     AND status='succeeded' AND input_json=%s
                     AND started_at > COALESCE(
                       (SELECT started_at FROM ai_agent_runs WHERE id=%s),
                       '-infinity'::timestamptz
                     )
                   ORDER BY started_at DESC LIMIT 1""",
                (
                    workflow_id,
                    workflow["version_id"],
                    env_id,
                    business_id,
                    Json(case["input_json"] or {}),
                    (case.get("expected_json") or {}).get("source_run_id"),
                ),
            )
            replay = cur.fetchone()
            if replay:
                regression_evidence[str(case["id"])] = str(replay["id"])

        results = evaluate_cases(graph, cases, regression_evidence=regression_evidence)
        summary = summarize_results(results)
        cur.execute(
            """INSERT INTO ai_agent_eval_runs
                 (env_id,business_id,suite_id,workflow_id,workflow_version_id,
                  actor_user_id,status,overall_status,summary_json,finished_at)
               VALUES (%s,%s,%s,%s,%s,%s,'completed',%s,%s,now())
               RETURNING id""",
            (
                env_id,
                business_id,
                suite_id,
                workflow_id,
                workflow["version_id"],
                actor,
                summary["overall_status"],
                Json(summary),
            ),
        )
        eval_run_id = str(cur.fetchone()["id"])
        for result in results:
            cur.execute(
                """INSERT INTO ai_agent_eval_results
                     (env_id,business_id,eval_run_id,eval_case_id,eval_class,status,
                      input_json,expected_json,actual_json,failed_assertion,trace_run_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    env_id,
                    business_id,
                    eval_run_id,
                    result["eval_case_id"],
                    result["eval_class"],
                    result["status"],
                    Json(agent_builder.redact_payload(result["input_json"])),
                    Json(result["expected_json"]),
                    Json(agent_builder.redact_payload(result["actual_json"])),
                    result["failed_assertion"],
                    result["trace_run_id"],
                ),
            )
    return get_eval_run(
        env_id=env_id, business_id=business_id, eval_run_id=eval_run_id
    )


def get_eval_run(*, env_id: str, business_id: str, eval_run_id: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT er.*, w.name AS workflow_name, v.version_number
               FROM ai_agent_eval_runs er
               JOIN ai_agent_workflows w ON w.id=er.workflow_id
               JOIN ai_agent_workflow_versions v ON v.id=er.workflow_version_id
               WHERE er.id=%s AND er.env_id=%s AND er.business_id=%s""",
            (eval_run_id, env_id, business_id),
        )
        run = cur.fetchone()
        if not run:
            raise LookupError("eval run not found")
        cur.execute(
            """SELECT r.*, c.case_key, c.title, c.source
               FROM ai_agent_eval_results r
               JOIN ai_agent_eval_cases c ON c.id=r.eval_case_id
               WHERE r.eval_run_id=%s AND r.env_id=%s AND r.business_id=%s
               ORDER BY r.eval_class, c.created_at, c.case_key""",
            (eval_run_id, env_id, business_id),
        )
        result = _row(run)
        result["results"] = [_row(item) for item in cur.fetchall()]
        return result


def get_workflow_evals(
    *, env_id: str, business_id: str, workflow_id: str
) -> dict[str, Any]:
    workflow = agent_builder.get_workflow(
        env_id=env_id, business_id=business_id, workflow_id=workflow_id
    )
    with get_cursor() as cur:
        cur.execute(
            """SELECT id FROM ai_agent_eval_runs
               WHERE workflow_id=%s AND workflow_version_id=%s
                 AND env_id=%s AND business_id=%s
               ORDER BY started_at DESC LIMIT 1""",
            (workflow_id, workflow["version_id"], env_id, business_id),
        )
        latest = cur.fetchone()
    if latest:
        return get_eval_run(
            env_id=env_id, business_id=business_id, eval_run_id=str(latest["id"])
        )
    pending = {
        eval_class: "not_run" if eval_class in REQUIRED_STAGED_CLASSES else "not_applicable"
        for eval_class in ALL_CLASSES
    }
    return {
        "workflow_id": workflow_id,
        "workflow_version_id": workflow["version_id"],
        "version_number": workflow["version_number"],
        "status": "not_run",
        "overall_status": "blocked",
        "summary_json": {
            "overall_status": "blocked",
            "by_class": pending,
            "blockers": [
                {"eval_class": eval_class, "reason": "required_eval_not_run"}
                for eval_class in REQUIRED_STAGED_CLASSES
            ],
            "counts": {"pass": 0, "fail": 0, "not_applicable": 3, "total": 10},
        },
        "results": [],
    }


def publish_workflow(
    *,
    env_id: str,
    business_id: str,
    actor: str,
    workflow_id: str,
    desired_status: str,
) -> dict[str, Any]:
    if desired_status != "staged":
        raise ValueError("Production publication is deferred; only staged publication is supported")
    workflow = agent_builder.get_workflow(
        env_id=env_id, business_id=business_id, workflow_id=workflow_id
    )
    readiness = get_workflow_evals(
        env_id=env_id, business_id=business_id, workflow_id=workflow_id
    )
    blockers = readiness["summary_json"].get("blockers") or []
    if readiness.get("overall_status") != "staged_ready" or blockers:
        raise ValueError("Workflow is blocked from staging by publish-readiness evals")
    with get_cursor() as cur:
        cur.execute(
            """UPDATE ai_agent_workflow_versions
               SET publish_status='staged', published_by=%s, published_at=now(),
                   publish_blockers='[]'::jsonb
               WHERE id=%s AND env_id=%s AND business_id=%s""",
            (actor, workflow["version_id"], env_id, business_id),
        )
        cur.execute(
            """UPDATE ai_agent_workflows
               SET status='staged', updated_at=now()
               WHERE id=%s AND current_version_id=%s AND env_id=%s AND business_id=%s""",
            (workflow_id, workflow["version_id"], env_id, business_id),
        )
    return agent_builder.get_workflow(
        env_id=env_id, business_id=business_id, workflow_id=workflow_id
    ) | {"publish_readiness": readiness}


def promote_failure(
    *,
    env_id: str,
    business_id: str,
    actor: str,
    run_id: str,
) -> dict[str, Any]:
    run = agent_builder.get_run(env_id=env_id, business_id=business_id, run_id=run_id)
    if run["status"] not in {"failed", "blocked", "not_available"}:
        raise ValueError("Only failed, blocked, or not_available runs can become regression cases")
    protected_payload = {
        "input": run.get("input_json") or {},
        "output": run.get("output_json") or {},
        "error": run.get("error_json") or {},
    }
    secret_paths = agent_builder.find_secret_paths(protected_payload)
    if secret_paths:
        raise ValueError("Run contains secret-shaped data and cannot be promoted")
    workflow = agent_builder.get_workflow(
        env_id=env_id,
        business_id=business_id,
        workflow_id=str(run["workflow_id"]),
    )
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM ai_agent_failure_memory
               WHERE source_run_id=%s AND env_id=%s AND business_id=%s""",
            (run_id, env_id, business_id),
        )
        existing = cur.fetchone()
        if existing:
            return _row(existing) | {"already_promoted": True}

        suite_id = _ensure_suite(
            cur,
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            workflow=workflow,
        )
        memory_id = str(uuid4())
        input_json = agent_builder.redact_payload(run.get("input_json") or {})
        expected = {
            "terminal_status": "succeeded",
            "source_run_id": run_id,
            "source_version_number": run["version_number"],
        }
        actual = {
            "terminal_status": run["status"],
            "terminal_reason": run.get("terminal_reason"),
            "output": agent_builder.redact_payload(run.get("output_json") or {}),
            "error": agent_builder.redact_payload(run.get("error_json") or {}),
        }
        cur.execute(
            """INSERT INTO ai_agent_eval_cases
                 (env_id,business_id,suite_id,case_key,eval_class,title,input_json,expected_json,source)
               VALUES (%s,%s,%s,%s,'regression',%s,%s,%s,'promoted_failure')
               RETURNING id""",
            (
                env_id,
                business_id,
                suite_id,
                f"regression-{memory_id}",
                f"Promoted failure {run_id}",
                Json(input_json),
                Json(expected),
            ),
        )
        eval_case_id = str(cur.fetchone()["id"])
        signature = agent_builder.sha256_json(
            {
                "workflow_id": run["workflow_id"],
                "status": run["status"],
                "terminal_reason": run.get("terminal_reason"),
                "input": input_json,
            }
        )
        cur.execute(
            """INSERT INTO ai_agent_failure_memory
                 (id,env_id,business_id,workflow_id,workflow_version_id,source_run_id,
                  eval_case_id,failure_signature,input_hash,input_json,expected_behavior,
                  actual_behavior,failure_reason,created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING *""",
            (
                memory_id,
                env_id,
                business_id,
                run["workflow_id"],
                run["workflow_version_id"],
                run_id,
                eval_case_id,
                signature,
                agent_builder.sha256_json(input_json),
                Json(input_json),
                Json(expected),
                Json(actual),
                run.get("terminal_reason"),
                actor,
            ),
        )
        return _row(cur.fetchone()) | {"already_promoted": False}
