from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from eval_loop.mutation_engine import expand_mutations_for_scenario


ROOT = Path(__file__).resolve().parent.parent
SCENARIO_FILES = (
    ROOT / "eval_loop" / "scenario_registry.json",
    ROOT / "eval_loop" / "golden_corpus.json",
)


def _load_registry(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text())
    scenarios = payload.get("scenarios", [])
    if not isinstance(scenarios, list):
        raise ValueError(f"{path.name} must contain a top-level scenarios array")
    return [deepcopy(item) for item in scenarios]


def _scenario_enabled_for_mode(scenario: dict[str, Any], mode: str) -> bool:
    suites = set(scenario.get("suite", ["full"]))
    if mode == "smoke":
        return "smoke" in suites
    return "full" in suites or "smoke" in suites


def _scenario_explicitly_global(scenario: dict[str, Any]) -> bool:
    return (
        scenario.get("global") is True
        or scenario.get("environment") == "global"
        or scenario.get("environment_scope") == "global"
    )


def scenario_enabled_for_environment(
    scenario: dict[str, Any],
    environment: str | None,
) -> bool:
    """Return True when a scenario belongs to the requested env-scoped run.

    Env-scoped eval runs are intentionally strict: cases from other
    environments are excluded, and environment-less fixtures are excluded
    unless they are explicitly marked global. This keeps Meridian and
    Novendor baselines/regressions isolated.
    """
    if not environment:
        return True
    if _scenario_explicitly_global(scenario):
        return True
    scenario_env = scenario.get("environment")
    if scenario_env == environment:
        return True
    scenario_envs = scenario.get("environments")
    return isinstance(scenario_envs, list) and environment in scenario_envs


def _with_default_contract_expectations(scenario: dict[str, Any]) -> dict[str, Any]:
    if scenario.get("kind", "assistant_turn") != "assistant_turn":
        return scenario
    expected = scenario.setdefault("expected", {})
    expected.setdefault("runtime_identity_required", True)
    expected.setdefault("runtime_path", "canonical")
    return scenario


def load_scenarios(
    *,
    mode: str,
    mutations_mode: str = "disabled",
    mutation_limit: int | None = None,
    environment: str | None = None,
) -> list[dict[str, Any]]:
    raw_scenarios: list[dict[str, Any]] = []
    for path in SCENARIO_FILES:
        raw_scenarios.extend(_load_registry(path))

    expanded: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_scenarios:
        if not _scenario_enabled_for_mode(raw, mode):
            continue
        if not scenario_enabled_for_environment(raw, environment):
            continue
        for scenario in expand_mutations_for_scenario(
            raw,
            mutations_mode=mutations_mode,
            mutation_limit=mutation_limit,
        ):
            scenario = _with_default_contract_expectations(scenario)
            scenario_id = scenario["id"]
            if scenario_id in seen:
                raise ValueError(f"Duplicate scenario id: {scenario_id}")
            seen.add(scenario_id)
            expanded.append(scenario)
    return expanded


def scenario_index(scenarios: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {scenario["id"]: scenario for scenario in scenarios}
