from __future__ import annotations

from typing import Any

from eval_loop.environment_matrix import environment_neighbors


def schedule_retests(results: list[dict[str, Any]], scenarios: list[dict[str, Any]]) -> list[str]:
    by_id = {scenario["id"]: scenario for scenario in scenarios}
    selected: set[str] = set()
    for result in results:
        if not result.get("passed"):
            selected.add(result["scenario_id"])
            scenario = by_id.get(result["scenario_id"])
            if not scenario:
                continue
            family = scenario.get("family")
            environment = scenario.get("environment")
            for candidate in scenarios:
                if candidate["id"] == scenario["id"]:
                    continue
                if family and candidate.get("family") == family:
                    selected.add(candidate["id"])
                if environment and candidate.get("environment") in environment_neighbors(environment):
                    selected.add(candidate["id"])
    return sorted(selected)

