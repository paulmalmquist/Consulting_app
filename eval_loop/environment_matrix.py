from __future__ import annotations

import json
import urllib.error
import urllib.request
from copy import deepcopy
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EnvironmentBinding:
    slug: str
    env_id: str
    business_id: str | None
    label: str


_ENV_DEFAULTS: dict[str, dict[str, Any]] = {
    "novendor": {
        "route": "/lab/env/{env_id}/consulting",
        "surface": "consulting_workspace",
        "active_environment_name": "Novendor",
        "active_business_name": "Novendor",
        "selected_entities": [
            {"entity_type": "client", "entity_id": "client_1", "name": "Novendor Client One", "source": "selection"}
        ],
        "visible_data": {
            "notes": ["Environment is Novendor", "Pipeline and delivery workspace"],
            "pipeline_items": [{"entity_type": "client", "entity_id": "client_1", "name": "Novendor Client One"}],
        },
    },
    "floyorker": {
        "route": "/lab/env/{env_id}/content",
        "surface": "editorial_workspace",
        "active_environment_name": "Floyorker",
        "active_business_name": "Floyorker",
        "selected_entities": [
            {"entity_type": "article", "entity_id": "post_1", "name": "Weekend Guide", "source": "selection"}
        ],
        "visible_data": {
            "notes": ["Environment is Floyorker", "Editorial workspace"],
            "documents": [{"entity_type": "article", "entity_id": "post_1", "name": "Weekend Guide"}],
        },
    },
    "stone-pds": {
        "route": "/lab/env/{env_id}/pds",
        "surface": "pds_workspace",
        "active_environment_name": "Stone PDS",
        "active_business_name": "Stone PDS",
        "selected_entities": [
            {"entity_type": "project", "entity_id": "project_1", "name": "Tower Retrofit", "source": "selection"}
        ],
        "visible_data": {
            "notes": ["Environment is Stone PDS", "Project delivery workspace"],
            "pipeline_items": [{"entity_type": "project", "entity_id": "project_1", "name": "Tower Retrofit"}],
        },
    },
    "meridian": {
        "route": "/lab/env/{env_id}/re/funds",
        "surface": "fund_portfolio",
        "active_environment_name": "Meridian",
        "active_business_name": "Meridian Capital Management",
        "selected_entities": [
            {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One", "source": "selection"}
        ],
        "visible_data": {
            "funds": [
                {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One"},
                {"entity_type": "fund", "entity_id": "fund_2", "name": "Fund Two"},
            ],
            "notes": ["Environment is Meridian", "Selected fund is Fund One"],
        },
    },
    "resume": {
        "route": "/lab/env/{env_id}/resume",
        "surface": "resume_workspace",
        "active_environment_name": "Resume",
        "active_business_name": "Paul Malmquist Resume",
        "selected_entities": [
            {"entity_type": "resume_profile", "entity_id": "resume_1", "name": "Paul Malmquist", "source": "selection"}
        ],
        "visible_data": {
            "notes": ["Environment is Resume", "Resume workspace for Paul Malmquist"],
            "documents": [{"entity_type": "resume_profile", "entity_id": "resume_1", "name": "Paul Malmquist"}],
        },
    },
    "trading": {
        "route": "/lab/env/{env_id}/markets",
        "surface": "trading_workspace",
        "active_environment_name": "Trading Platform",
        "active_business_name": "Trading Platform",
        "selected_entities": [
            {"entity_type": "portfolio", "entity_id": "book_1", "name": "Core Book", "source": "selection"}
        ],
        "visible_data": {
            "notes": ["Environment is Trading Platform", "Markets workspace"],
            "models": [{"entity_type": "portfolio", "entity_id": "book_1", "name": "Core Book"}],
        },
    },
}


def discover_environment_bindings(backend_origin: str, timeout_seconds: float = 5.0) -> dict[str, EnvironmentBinding]:
    url = backend_origin.rstrip("/") + "/v1/environments"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {}

    bindings: dict[str, EnvironmentBinding] = {}
    for env in payload.get("environments", []):
        slug = env.get("slug")
        env_id = env.get("env_id")
        if not slug or not env_id:
            continue
        bindings[slug] = EnvironmentBinding(
            slug=slug,
            env_id=env_id,
            business_id=env.get("business_id"),
            label=env.get("client_name") or env.get("name") or slug,
        )
    return bindings


def build_context_envelope(
    *,
    environment: str | None,
    bindings: dict[str, EnvironmentBinding],
    route: str | None = None,
    surface: str | None = None,
    selected_entities: list[dict[str, Any]] | None = None,
    visible_data: dict[str, Any] | None = None,
    active_environment_name: str | None = None,
    active_business_name: str | None = None,
    session_roles: list[str] | None = None,
    thread: dict[str, Any] | None = None,
    omit_environment: bool = False,
) -> dict[str, Any]:
    if environment is None or omit_environment:
        return {
            "session": {"roles": session_roles or ["env_user"]},
            "ui": {
                "route": route or "/assistant",
                "surface": surface or "assistant",
                "selected_entities": selected_entities or [],
                "visible_data": visible_data or {},
            },
            "thread": {
                "assistant_mode": "environment_copilot",
                "scope_type": "environment",
                "launch_source": "eval_loop",
                **(thread or {}),
            },
        }

    binding = bindings.get(environment) or EnvironmentBinding(
        slug=environment,
        env_id=f"env-{environment}",
        business_id=None,
        label=_ENV_DEFAULTS.get(environment, {}).get("active_environment_name", environment),
    )
    defaults = deepcopy(_ENV_DEFAULTS.get(environment, {}))
    final_route = route or defaults.get("route", "/lab/env/{env_id}").format(env_id=binding.env_id)
    final_surface = surface or defaults.get("surface", "assistant")
    final_selected = deepcopy(selected_entities if selected_entities is not None else defaults.get("selected_entities", []))
    final_visible = deepcopy(visible_data if visible_data is not None else defaults.get("visible_data", {}))

    return {
        "session": {"roles": session_roles or ["env_user"]},
        "ui": {
            "route": final_route,
            "surface": final_surface,
            "active_environment_id": binding.env_id,
            "active_environment_name": active_environment_name or defaults.get("active_environment_name") or binding.label,
            "active_business_id": binding.business_id,
            "active_business_name": active_business_name or defaults.get("active_business_name") or binding.label,
            "selected_entities": final_selected,
            "visible_data": final_visible,
        },
        "thread": {
            "assistant_mode": "environment_copilot",
            "scope_type": "environment",
            "launch_source": "eval_loop",
            **(thread or {}),
        },
    }


def environment_neighbors(environment: str | None) -> list[str]:
    if environment == "meridian":
        return ["stone-pds", "novendor"]
    if environment == "novendor":
        return ["meridian", "resume"]
    if environment == "resume":
        return ["novendor", "floyorker"]
    if environment == "stone-pds":
        return ["meridian", "trading"]
    if environment == "floyorker":
        return ["novendor", "resume"]
    if environment == "trading":
        return ["stone-pds", "meridian"]
    return []
