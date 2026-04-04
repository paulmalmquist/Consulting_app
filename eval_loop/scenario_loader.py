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


def load_scenarios(
    *,
    mode: str,
    mutations_mode: str = "disabled",
    mutation_limit: int | None = None,
) -> list[dict[str, Any]]:
    raw_scenarios: list[dict[str, Any]] = []
    for path in SCENARIO_FILES:
        raw_scenarios.extend(_load_registry(path))

    expanded: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_scenarios:
        if not _scenario_enabled_for_mode(raw, mode):
            continue
        for scenario in expand_mutations_for_scenario(
            raw,
            mutations_mode=mutations_mode,
            mutation_limit=mutation_limit,
        ):
            scenario_id = scenario["id"]
            if scenario_id in seen:
                raise ValueError(f"Duplicate scenario id: {scenario_id}")
            seen.add(scenario_id)
            expanded.append(scenario)
    return expanded


def scenario_index(scenarios: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {scenario["id"]: scenario for scenario in scenarios}
