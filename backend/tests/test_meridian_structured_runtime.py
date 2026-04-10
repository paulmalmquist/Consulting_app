from __future__ import annotations

import asyncio
import json
import os
import uuid
from copy import deepcopy
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from app.assistant_runtime.meridian_structured_runtime import (  # noqa: E402
    MERIDIAN_BUSINESS_ID,
    MERIDIAN_ENV_ID,
    _parse_contract,
)
from app.assistant_runtime.request_lifecycle import run_request_lifecycle  # noqa: E402
from app.assistant_runtime.turn_receipts import ContextReceipt, ContextResolutionStatus  # noqa: E402
from app.schemas.ai_gateway import AssistantContextEnvelope  # noqa: E402
from app.schemas.ai_gateway import ResolvedAssistantScope  # noqa: E402


def _meridian_envelope() -> AssistantContextEnvelope:
    return AssistantContextEnvelope.model_validate(
        {
            "session": {
                "roles": ["env_user"],
                "org_id": MERIDIAN_BUSINESS_ID,
                "session_env_id": MERIDIAN_ENV_ID,
            },
            "ui": {
                "route": f"/lab/env/{MERIDIAN_ENV_ID}/re",
                "surface": "environment_dashboard",
                "active_environment_id": MERIDIAN_ENV_ID,
                "active_environment_name": "Meridian Capital Management",
                "active_business_id": MERIDIAN_BUSINESS_ID,
                "page_entity_type": "environment",
                "page_entity_id": MERIDIAN_ENV_ID,
                "page_entity_name": "Meridian Capital Management",
                "selected_entities": [],
                "visible_data": {
                    "funds": [],
                    "investments": [],
                    "assets": [],
                    "models": [],
                    "pipeline_items": [],
                },
            },
            "thread": {
                "assistant_mode": "environment_copilot",
                "scope_type": "environment",
                "scope_id": MERIDIAN_ENV_ID,
            },
        }
    )


def _done_payload(events: list[str]) -> dict[str, object]:
    for event in reversed(events):
        if event.startswith("event: done\n"):
            return json.loads(event.split("data: ", 1)[1])
    raise AssertionError("Missing done event")


async def _collect_sse_events(generator):
    events: list[str] = []
    async for event in generator:
        events.append(event)
    return events


def _fixture_assets() -> list[dict[str, object]]:
    return [
        {"asset_id": "asset_1", "name": "Alpha Tower", "asset_status": "active"},
        {"asset_id": "asset_2", "name": "Bravo Plaza", "asset_status": "held"},
        {"asset_id": "asset_3", "name": "Canal Shops", "asset_status": "operating"},
        {"asset_id": "asset_4", "name": "Delta Yard", "asset_status": None},
        {"asset_id": "asset_5", "name": "Elm Logistics", "asset_status": "disposed"},
        {"asset_id": "asset_6", "name": "Foundry Office", "asset_status": "realized"},
        {"asset_id": "asset_7", "name": "Gateway Labs", "asset_status": "pipeline"},
        {"asset_id": "asset_8", "name": "Harbor Retail", "asset_status": "paused"},
    ]


def _apply_meridian_mocks(monkeypatch):
    thread_states: dict[str, dict[str, object]] = {}

    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.OPENAI_API_KEY",
        "test-key",
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.check_pending_action",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.resolve_runtime_context",
        lambda **_kwargs: SimpleNamespace(
            envelope=_meridian_envelope(),
            resolved_scope=ResolvedAssistantScope(
                resolved_scope_type="environment",
                environment_id=MERIDIAN_ENV_ID,
                business_id=MERIDIAN_BUSINESS_ID,
                entity_type="environment",
                entity_id=MERIDIAN_ENV_ID,
                entity_name="Meridian Capital Management",
                confidence=1.0,
                source="test",
            ),
            receipt=ContextReceipt(
                environment_id=MERIDIAN_ENV_ID,
                entity_type="environment",
                entity_id=MERIDIAN_ENV_ID,
                resolution_status=ContextResolutionStatus.RESOLVED,
                notes=[],
                inherited_entity_id=None,
                inherited_entity_source=None,
            ),
        ),
    )

    async def _unexpected_dispatch(**_kwargs):
        raise AssertionError("dispatch_request should not run for Meridian structured queries")

    async def _unexpected_retrieval(**_kwargs):
        raise AssertionError("execute_retrieval should not run for Meridian structured queries")

    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.dispatch_request", _unexpected_dispatch)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.execute_retrieval", _unexpected_retrieval)

    def _get_thread_entity_state(conversation_id):
        return deepcopy(thread_states.get(str(conversation_id), {}))

    def _update_thread_result_memory(conversation_id, *, result_memory):
        state = thread_states.setdefault(str(conversation_id), {})
        state["result_memory"] = deepcopy(result_memory)

    def _update_thread_structured_query_state(conversation_id, *, structured_query_state):
        state = thread_states.setdefault(str(conversation_id), {})
        state["structured_query_state"] = deepcopy(structured_query_state)

    def _update_thread_entity_state(
        conversation_id,
        *,
        entity_type,
        entity_id,
        name=None,
        source="resolved_scope",
        turn_request_id=None,
        active_metric=None,
        active_timeframe=None,
        last_skill_id=None,
    ):
        state = thread_states.setdefault(str(conversation_id), {})
        state["resolved_entities"] = [
            {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "name": name,
                "source": source,
                "turn_request_id": turn_request_id,
            }
        ]
        state["active_context"] = {
            "entity": {"type": entity_type, "id": entity_id, "name": name},
            "metric": active_metric,
            "timeframe": active_timeframe,
            "last_skill_id": last_skill_id,
        }

    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.get_thread_entity_state",
        _get_thread_entity_state,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.update_thread_result_memory",
        _update_thread_result_memory,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.update_thread_structured_query_state",
        _update_thread_structured_query_state,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.update_thread_entity_state",
        _update_thread_entity_state,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.append_message",
        lambda **_kwargs: None,
    )

    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime.repe.list_funds",
        lambda **_kwargs: [
            {
                "fund_id": "fund_1",
                "name": "Meridian Core Fund I",
                "vintage_year": 2020,
                "fund_type": "closed_end",
                "strategy": "equity",
                "status": "active",
                "target_size": "550000000",
            },
            {
                "fund_id": "fund_2",
                "name": "Meridian Value Fund III",
                "vintage_year": 2023,
                "fund_type": "closed_end",
                "strategy": "equity",
                "status": "active",
                "target_size": "400000000",
            },
        ],
    )
    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime.repe.list_property_assets",
        lambda **_kwargs: _fixture_assets(),
    )
    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime.repe.count_assets",
        lambda **_kwargs: {"active": 4, "disposed": 2, "pipeline": 1, "total": 8},
    )
    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime.re_env_portfolio.get_portfolio_kpis",
        lambda **_kwargs: {
            "quarter": "2026Q1",
            "total_commitments": "950000000",
            "active_assets": 4,
        },
    )
    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime._resolve_fund_quarter",
        lambda explicit_quarter, _business_id: explicit_quarter or "2026Q1",
    )
    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime._resolve_variance_quarter",
        lambda explicit_quarter, _business_id: explicit_quarter or "2026Q1",
    )

    def _run_template(template_key: str, params: dict[str, object]):
        if template_key == "repe.fund_performance_summary":
            return [
                {
                    "fund_id": "fund_1",
                    "fund_name": "Meridian Core Fund I",
                    "quarter": "2026Q1",
                    "gross_irr": "0.182",
                    "net_irr": "0.151",
                    "tvpi": "1.70",
                    "dpi": "0.61",
                    "rvpi": "1.09",
                    "portfolio_nav": "610000000",
                    "total_committed": "550000000",
                },
                {
                    "fund_id": "fund_2",
                    "fund_name": "Meridian Value Fund III",
                    "quarter": "2026Q1",
                    "gross_irr": "0.161",
                    "net_irr": "0.138",
                    "tvpi": "1.48",
                    "dpi": "0.33",
                    "rvpi": "1.15",
                    "portfolio_nav": "355000000",
                    "total_committed": "400000000",
                },
            ]
        if template_key == "repe.irr_ranked":
            return [
                {
                    "fund_name": "Meridian Core Fund I",
                    "gross_irr": "0.182",
                    "quarter": params.get("quarter", "2026Q1"),
                },
                {
                    "fund_name": "Meridian Value Fund III",
                    "gross_irr": "0.161",
                    "quarter": params.get("quarter", "2026Q1"),
                },
            ]
        if template_key == "repe.commitments_by_fund":
            return [
                {"fund_id": "fund_1", "fund_name": "Meridian Core Fund I", "commitments": "550000000"},
                {"fund_id": "fund_2", "fund_name": "Meridian Value Fund III", "commitments": "400000000"},
            ]
        if template_key == "repe.noi_variance_ranked":
            rows = [
                {"asset_id": "asset_8", "asset_name": "Harbor Retail", "market": "Austin", "variance_pct": "-0.110"},
                {"asset_id": "asset_7", "asset_name": "Gateway Labs", "market": "Phoenix", "variance_pct": "-0.070"},
                {"asset_id": "asset_6", "asset_name": "Foundry Office", "market": "Denver", "variance_pct": "-0.030"},
                {"asset_id": "asset_1", "asset_name": "Alpha Tower", "market": "Dallas", "variance_pct": "0.020"},
            ]
            if params.get("sort_direction") == "desc":
                return list(reversed(rows))
            return rows
        if template_key == "repe.noi_variance_filtered":
            return [
                {"asset_id": "asset_8", "asset_name": "Harbor Retail", "variance_pct": "-0.110"},
                {"asset_id": "asset_7", "asset_name": "Gateway Labs", "variance_pct": "-0.070"},
            ]
        if template_key == "repe.occupancy_filtered":
            return [
                {"asset_id": "asset_1", "asset_name": "Alpha Tower", "occupancy": "0.970", "market": "Dallas"},
                {"asset_id": "asset_2", "asset_name": "Bravo Plaza", "occupancy": "0.950", "market": "Atlanta"},
                {"asset_id": "asset_3", "asset_name": "Canal Shops", "occupancy": "0.910", "market": "Miami"},
            ]
        raise AssertionError(f"Unexpected template {template_key}")

    monkeypatch.setattr(
        "app.assistant_runtime.meridian_structured_runtime._run_template",
        _run_template,
    )

    return thread_states


def test_meridian_parser_enforces_transformation_precedence():
    contract, memory_used = _parse_contract(
        message="sort the assets by NOI variance",
        structured_state={},
    )

    assert memory_used is False
    assert contract is not None
    assert contract.transformation == "rank"
    assert contract.metric == "noi_variance"
    assert contract.sort_by == "noi_variance"
    assert contract.sort_direction == "desc"


def test_meridian_parser_applies_filter_and_group_operators():
    contract, _memory_used = _parse_contract(
        message="summarize each funds performance",
        structured_state={},
    )
    filtered, _memory_used2 = _parse_contract(
        message="which assets have occupancy above 90%",
        structured_state={},
    )

    assert contract is not None
    assert contract.group_by == "fund"
    assert contract.aggregation == "latest"
    assert filtered is not None
    assert filtered.transformation == "filter"
    assert filtered.filters[0].field == "occupancy"
    assert filtered.filters[0].operator == ">"


def test_meridian_runtime_short_circuits_before_dispatch(monkeypatch):
    thread_states = _apply_meridian_mocks(monkeypatch)
    conversation_id = uuid.uuid4()

    events = asyncio.run(
        _collect_sse_events(
            run_request_lifecycle(
                message="list investments by gross IRR descending as of 2026Q1",
                context_envelope=_meridian_envelope(),
                conversation_id=conversation_id,
                actor="tester",
            )
        )
    )
    payload = _done_payload(events)
    receipt = payload["turn_receipt"]
    stored_state = thread_states[str(conversation_id)]["structured_query_state"]

    assert receipt["dispatch"]["normalized"]["notes"] == ["meridian_structured_runtime"]
    assert receipt["structured_query"]["execution_path"] == "degraded"
    assert receipt["structured_query"]["degraded"] is True
    assert receipt["structured_query"]["transformation_applied"] == "rank"
    assert "closest valid grain is released authoritative fund performance" in payload["response_blocks"][0]["markdown"].lower()
    assert stored_state["last_execution"]["degraded"] is True
    assert stored_state["last_execution"]["canonical_source"] == "re_authoritative_fund_state_qtr"


def test_meridian_conversation_pack_exact_prompts(monkeypatch, capsys):
    _apply_meridian_mocks(monkeypatch)
    conversation_id = uuid.uuid4()
    prompts = [
        "give me a rundown of the funds",
        "summarize each funds performance",
        "list all funds",
        "list investments by gross IRR descending as of 2026Q1",
        "sort the assets by NOI variance",
        "rank the assets by NOI variance worst to best",
        "which have an NOI variance of -5% or worse",
        "which assets have occupancy above 90%",
        "how many total assets are there in the portfolio",
        "how many active assets do we have",
        "how much do we have in total commitments",
        "can you break that out by fund",
        "how many assets do we have in the portal",
        "what are the names of the other 4",
        "which ones are not active",
        "list investments by gross IRR descending as of 2026Q1",
    ]

    rows: list[dict[str, object]] = []
    payloads: list[dict[str, object]] = []
    for prompt in prompts:
        events = asyncio.run(
            _collect_sse_events(
                run_request_lifecycle(
                    message=prompt,
                    context_envelope=_meridian_envelope(),
                    conversation_id=conversation_id,
                    actor="tester",
                )
            )
        )
        payload = _done_payload(events)
        payloads.append(payload)
        receipt = payload["turn_receipt"]
        structured = receipt.get("structured_query")
        notes = receipt["dispatch"]["normalized"]["notes"]
        response_text = "\n".join(
            block.get("markdown", "")
            for block in payload.get("response_blocks", [])
        )

        used_memory = bool(structured and structured.get("memory_used")) or "deterministic_referential_followup" in notes
        path = structured.get("execution_path") if structured else "referential"
        degraded = bool(structured and structured.get("degraded")) or receipt["status"] == "degraded"
        parsed_ok = structured is not None or "deterministic_referential_followup" in notes
        executed = parsed_ok

        valid = True
        if prompt == "give me a rundown of the funds":
            valid = "Meridian Core Fund I" in response_text and "Meridian Value Fund III" in response_text
        elif prompt == "summarize each funds performance":
            valid = "gross IRR 18.2%" in response_text and "gross IRR 16.1%" in response_text
        elif prompt == "list all funds":
            valid = response_text.count("Meridian") >= 2
        elif prompt == "list investments by gross IRR descending as of 2026Q1":
            valid = "closest valid grain is released authoritative fund performance" in response_text.lower()
        elif prompt == "sort the assets by NOI variance":
            valid = "Alpha Tower" in response_text and "Harbor Retail" in response_text
        elif prompt == "rank the assets by NOI variance worst to best":
            valid = "1. Harbor Retail" in response_text
        elif prompt == "which have an NOI variance of -5% or worse":
            valid = "Gateway Labs" in response_text and "Harbor Retail" in response_text
        elif prompt == "which assets have occupancy above 90%":
            valid = "Alpha Tower" in response_text and "Canal Shops" in response_text
        elif prompt == "how many total assets are there in the portfolio":
            valid = "8 total property assets" in response_text
        elif prompt == "how many active assets do we have":
            valid = "4 active property assets" in response_text
        elif prompt == "how much do we have in total commitments":
            valid = "$950,000,000" in response_text
        elif prompt == "can you break that out by fund":
            valid = "Meridian Core Fund I" in response_text and "Meridian Value Fund III" in response_text and used_memory
        elif prompt == "how many assets do we have in the portal":
            valid = "8 total property assets" in response_text
        elif prompt == "what are the names of the other 4":
            valid = all(name in response_text for name in ["Elm Logistics", "Foundry Office", "Gateway Labs", "Harbor Retail"])
        elif prompt == "which ones are not active":
            valid = all(name in response_text for name in ["Elm Logistics", "Foundry Office", "Gateway Labs", "Harbor Retail"])

        rows.append(
            {
                "Prompt": prompt,
                "Parsed OK": parsed_ok,
                "Executed": executed,
                "Used memory": used_memory,
                "Degraded": degraded,
                "Valid": valid,
                "Path": path,
            }
        )

    header = "| Prompt | Parsed OK | Executed | Used memory | Degraded | Valid | Path |"
    separator = "|---|---:|---:|---:|---:|---:|---|"
    table_lines = [header, separator]
    for row in rows:
        table_lines.append(
            f"| {row['Prompt']} | {int(bool(row['Parsed OK']))} | {int(bool(row['Executed']))} | "
            f"{int(bool(row['Used memory']))} | {int(bool(row['Degraded']))} | {int(bool(row['Valid']))} | {row['Path']} |"
        )
    print("\n".join(table_lines))
    captured = capsys.readouterr()

    assert all(bool(row["Parsed OK"]) for row in rows)
    assert all(bool(row["Executed"]) for row in rows)
    assert all(bool(row["Valid"]) for row in rows)
    assert rows[11]["Used memory"] is True
    assert rows[13]["Path"] == "referential"
    assert rows[14]["Path"] == "referential"
    assert "list investments by gross IRR descending as of 2026Q1" in captured.out
    assert "| Prompt | Parsed OK | Executed | Used memory | Degraded | Valid | Path |" in captured.out
