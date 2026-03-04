"""RE Model / Scenario MCP tools for cross-fund modeling."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.re_model_tools import (
    ModelsGetInput,
    ModelsCreateInput,
    ModelsListInput,
    ScenariosListInput,
    ScenariosCreateInput,
    ScenariosCloneInput,
    ScenariosGetInput,
    ScenariosSetOverridesInput,
    ScenariosRunInput,
    RunsGetInput,
    ScenariosCompareInput,
)
from app.services import re_model, re_model_scenario, re_scenario_engine


def _models_get(ctx: McpContext, inp: ModelsGetInput) -> dict:
    model = re_model.get_model(model_id=inp.model_id)
    return {"model": _serialize(model)}


def _models_create(ctx: McpContext, inp: ModelsCreateInput) -> dict:
    model = re_model.create_model(
        fund_id=inp.primary_fund_id,
        env_id=inp.env_id,
        name=inp.name,
        description=inp.description,
        strategy_type=inp.strategy_type,
    )
    return {"model": _serialize(model)}


def _models_list(ctx: McpContext, inp: ModelsListInput) -> dict:
    models = re_model.list_models(env_id=inp.env_id)
    return {"models": [_serialize(m) for m in models]}


def _scenarios_list(ctx: McpContext, inp: ScenariosListInput) -> dict:
    scenarios = re_model_scenario.list_scenarios(model_id=inp.model_id)
    return {"scenarios": [_serialize(s) for s in scenarios]}


def _scenarios_create(ctx: McpContext, inp: ScenariosCreateInput) -> dict:
    scenario = re_model_scenario.create_scenario(
        model_id=inp.model_id,
        name=inp.name,
        description=inp.description,
    )
    return {"scenario": _serialize(scenario)}


def _scenarios_clone(ctx: McpContext, inp: ScenariosCloneInput) -> dict:
    scenario = re_model_scenario.clone_scenario(
        scenario_id=inp.scenario_id,
        new_name=inp.new_name,
    )
    return {"scenario": _serialize(scenario)}


def _scenarios_get(ctx: McpContext, inp: ScenariosGetInput) -> dict:
    scenario = re_model_scenario.get_scenario(scenario_id=inp.scenario_id)
    assets = re_model_scenario.list_scenario_assets(scenario_id=inp.scenario_id)
    overrides = re_model_scenario.list_scenario_overrides(scenario_id=inp.scenario_id)
    return {
        "scenario": _serialize(scenario),
        "assets": [_serialize(a) for a in assets],
        "overrides": [_serialize(o) for o in overrides],
    }


def _scenarios_set_overrides(ctx: McpContext, inp: ScenariosSetOverridesInput) -> dict:
    override = re_model_scenario.set_scenario_override(
        scenario_id=inp.scenario_id,
        scope_type=inp.scope_type,
        scope_id=inp.scope_id,
        key=inp.key,
        value_json=inp.value_json,
    )
    return {"override": _serialize(override)}


def _scenarios_run(ctx: McpContext, inp: ScenariosRunInput) -> dict:
    result = re_scenario_engine.run_scenario(scenario_id=inp.scenario_id)
    return {"result": _serialize(result)}


def _runs_get(ctx: McpContext, inp: RunsGetInput) -> dict:
    run = re_scenario_engine.get_run(run_id=inp.run_id)
    return {"run": _serialize(run)}


def _scenarios_compare(ctx: McpContext, inp: ScenariosCompareInput) -> dict:
    result = re_scenario_engine.compare_scenarios(scenario_ids=inp.scenario_ids)
    return {"comparison": _serialize(result)}


def _serialize(obj: dict | list) -> dict | list:
    """Convert non-serializable types to strings."""
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {k: str(v) if hasattr(v, "isoformat") else v for k, v in obj.items()}
    return obj


def register_re_model_tools():
    registry.register(ToolDef(
        name="models.get",
        description="Get a cross-fund RE model by ID",
        module="bm",
        permission="read",
        input_model=ModelsGetInput,
        handler=_models_get,
    ))
    registry.register(ToolDef(
        name="models.create",
        description="Create a new cross-fund RE model (auto-creates Base scenario)",
        module="bm",
        permission="write",
        input_model=ModelsCreateInput,
        handler=_models_create,
    ))
    registry.register(ToolDef(
        name="models.list",
        description="List RE models, optionally filtered by environment",
        module="bm",
        permission="read",
        input_model=ModelsListInput,
        handler=_models_list,
    ))
    registry.register(ToolDef(
        name="scenarios.list",
        description="List scenarios for a model",
        module="bm",
        permission="read",
        input_model=ScenariosListInput,
        handler=_scenarios_list,
    ))
    registry.register(ToolDef(
        name="scenarios.create",
        description="Create a new scenario under a model",
        module="bm",
        permission="write",
        input_model=ScenariosCreateInput,
        handler=_scenarios_create,
    ))
    registry.register(ToolDef(
        name="scenarios.clone",
        description="Clone a scenario (copies scope and overrides)",
        module="bm",
        permission="write",
        input_model=ScenariosCloneInput,
        handler=_scenarios_clone,
    ))
    registry.register(ToolDef(
        name="scenarios.get",
        description="Get scenario details including assets and overrides",
        module="bm",
        permission="read",
        input_model=ScenariosGetInput,
        handler=_scenarios_get,
    ))
    registry.register(ToolDef(
        name="scenarios.set_overrides",
        description="Set an assumption override for a scenario",
        module="bm",
        permission="write",
        input_model=ScenariosSetOverridesInput,
        handler=_scenarios_set_overrides,
    ))
    registry.register(ToolDef(
        name="scenarios.run",
        description="Run a scenario: apply overrides, recalculate cash flows, persist outputs",
        module="bm",
        permission="write",
        input_model=ScenariosRunInput,
        handler=_scenarios_run,
    ))
    registry.register(ToolDef(
        name="runs.get",
        description="Get the details and outputs of a scenario run",
        module="bm",
        permission="read",
        input_model=RunsGetInput,
        handler=_runs_get,
    ))
    registry.register(ToolDef(
        name="scenarios.compare",
        description="Compare outputs across multiple scenario runs",
        module="bm",
        permission="read",
        input_model=ScenariosCompareInput,
        handler=_scenarios_compare,
    ))
