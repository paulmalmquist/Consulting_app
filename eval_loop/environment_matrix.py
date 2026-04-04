from __future__ import annotations

import json
import os
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


_FALLBACK_BINDINGS: dict[str, EnvironmentBinding] = {
    "novendor": EnvironmentBinding(
        slug="novendor",
        env_id="11111111-1111-4111-8111-111111111111",
        business_id="21111111-1111-4111-8111-111111111111",
        label="Novendor",
    ),
    "floyorker": EnvironmentBinding(
        slug="floyorker",
        env_id="22222222-2222-4222-8222-222222222222",
        business_id="32222222-2222-4222-8222-222222222222",
        label="Floyorker",
    ),
    "stone-pds": EnvironmentBinding(
        slug="stone-pds",
        env_id="33333333-3333-4333-8333-333333333333",
        business_id="43333333-3333-4333-8333-333333333333",
        label="Stone PDS",
    ),
    "meridian": EnvironmentBinding(
        slug="meridian",
        env_id="44444444-4444-4444-8444-444444444444",
        business_id="54444444-4444-4444-8444-444444444444",
        label="Meridian",
    ),
    "resume": EnvironmentBinding(
        slug="resume",
        env_id="55555555-5555-4555-8555-555555555555",
        business_id="65555555-5555-4555-8555-555555555555",
        label="Resume",
    ),
    "trading": EnvironmentBinding(
        slug="trading",
        env_id="66666666-6666-4666-8666-666666666666",
        business_id="76666666-6666-4666-8666-666666666666",
        label="Trading Platform",
    ),
}


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


_PAGE_DEFAULTS: dict[str, dict[str, Any]] = {
    "meridian:fund_detail": {
        "route": "/lab/env/{env_id}/re/funds/fund_1",
        "surface": "fund_detail",
        "active_environment_name": "Meridian",
        "active_business_name": "Meridian Capital Management",
        "selected_entities": [
            {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One", "source": "route"},
        ],
        "visible_data": {
            "funds": [
                {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One"},
            ],
            "metrics": {"irr": "12.4%", "tvpi": "1.35x", "nav": "$142M", "noi": "$8.2M"},
            "notes": ["Environment is Meridian", "Viewing Fund One detail page"],
        },
    },
    "meridian:asset_detail": {
        "route": "/lab/env/{env_id}/re/assets/asset_1",
        "surface": "asset_detail",
        "active_environment_name": "Meridian",
        "active_business_name": "Meridian Capital Management",
        "selected_entities": [
            {"entity_type": "asset", "entity_id": "asset_1", "name": "Ashford Commons", "source": "route"},
        ],
        "visible_data": {
            "assets": [
                {"entity_type": "asset", "entity_id": "asset_1", "name": "Ashford Commons"},
            ],
            "metrics": {"cap_rate": "5.8%", "occupancy": "94%", "noi": "$2.1M", "dscr": "1.42"},
            "notes": ["Environment is Meridian", "Viewing Ashford Commons asset detail"],
        },
    },
    "meridian:re_overview": {
        "route": "/lab/env/{env_id}/re",
        "surface": "re_overview",
        "active_environment_name": "Meridian",
        "active_business_name": "Meridian Capital Management",
        "selected_entities": [],
        "visible_data": {
            "funds": [
                {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One"},
                {"entity_type": "fund", "entity_id": "fund_2", "name": "Fund Two"},
                {"entity_type": "fund", "entity_id": "fund_3", "name": "Fund Three"},
            ],
            "notes": ["Environment is Meridian", "RE portfolio overview showing all funds"],
        },
    },
    "meridian:deals": {
        "route": "/lab/env/{env_id}/re/deals",
        "surface": "deal_pipeline",
        "active_environment_name": "Meridian",
        "active_business_name": "Meridian Capital Management",
        "selected_entities": [],
        "visible_data": {
            "pipeline_items": [
                {"entity_type": "deal", "entity_id": "deal_1", "name": "200 Main Street"},
            ],
            "notes": ["Environment is Meridian", "Deal pipeline view"],
        },
    },
    "novendor:operations": {
        "route": "/lab/env/{env_id}/consulting/operations",
        "surface": "operations_workspace",
        "active_environment_name": "Novendor",
        "active_business_name": "Novendor",
        "selected_entities": [],
        "visible_data": {
            "notes": ["Environment is Novendor", "Operations follow-up view"],
            "pipeline_items": [
                {"entity_type": "client", "entity_id": "client_1", "name": "Novendor Client One"},
            ],
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
        payload = None

    bindings: dict[str, EnvironmentBinding] = {}
    for env in (payload or {}).get("environments", []):
        slug = env.get("slug") or _slug_from_label(env.get("client_name") or env.get("name"))
        env_id = env.get("env_id")
        if not slug or not env_id:
            continue
        bindings[slug] = EnvironmentBinding(
            slug=slug,
            env_id=env_id,
            business_id=env.get("business_id"),
            label=env.get("client_name") or env.get("name") or slug,
        )

    db_bindings = _discover_environment_bindings_from_db()
    for slug, binding in db_bindings.items():
        existing = bindings.get(slug)
        if existing is None:
            bindings[slug] = binding
            continue
        if existing.business_id:
            continue
        bindings[slug] = EnvironmentBinding(
            slug=existing.slug,
            env_id=existing.env_id or binding.env_id,
            business_id=binding.business_id,
            label=existing.label or binding.label,
        )
    return bindings


def _slug_from_label(label: str | None) -> str | None:
    if not label:
        return None
    lowered = label.strip().lower()
    known = {
        "novendor": "novendor",
        "floyorker": "floyorker",
        "stone pds": "stone-pds",
        "stone-pds": "stone-pds",
        "meridian capital management": "meridian",
        "meridian": "meridian",
        "my resume": "resume",
        "resume": "resume",
        "trading platform": "trading",
    }
    if lowered in known:
        return known[lowered]
    for needle, slug in known.items():
        if needle in lowered:
            return slug
    slug = "-".join(part for part in lowered.replace("/", " ").split() if part)
    return slug or None


def _database_url() -> str | None:
    return (
        os.environ.get("DATABASE_URL")
        or os.environ.get("SUPABASE_DB_URL")
        or os.environ.get("POSTGRES_URL")
    )


def _discover_environment_bindings_from_db() -> dict[str, EnvironmentBinding]:
    database_url = _database_url()
    if not database_url:
        return {}

    try:
        import psycopg
    except Exception:
        return {}

    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT env_id::text, client_name, business_id::text
                    FROM app.environments
                    ORDER BY client_name
                    """
                )
                rows = cur.fetchall()
    except Exception:
        return {}

    bindings: dict[str, EnvironmentBinding] = {}
    for env_id, client_name, business_id in rows:
        slug = _slug_from_label(client_name)
        if not slug or not env_id:
            continue
        bindings[slug] = EnvironmentBinding(
            slug=slug,
            env_id=env_id,
            business_id=business_id,
            label=client_name or slug,
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
    page_type: str | None = None,
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

    binding = bindings.get(environment) or _FALLBACK_BINDINGS.get(
        environment,
        EnvironmentBinding(
            slug=environment,
            env_id="99999999-9999-4999-8999-999999999999",
            business_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            label=_ENV_DEFAULTS.get(environment, {}).get("active_environment_name", environment),
        ),
    )
    defaults = deepcopy(_ENV_DEFAULTS.get(environment, {}))

    # Merge page-level defaults when page_type is specified
    if page_type:
        page_key = f"{environment}:{page_type}"
        page_defaults = deepcopy(_PAGE_DEFAULTS.get(page_key, {}))
        if page_defaults:
            defaults.update(page_defaults)

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
