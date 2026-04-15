"""DB-backed reader for the v2 environment_templates registry.

Used exclusively by create_environment_v2 and the /v2/environments/templates endpoint.
Legacy envs never touch this module.
"""

from __future__ import annotations

import time
from typing import Any

from app.db import get_cursor


_CACHE: dict[str, Any] = {"templates": None, "fetched_at": 0.0}
_CACHE_TTL_SECONDS = 300


def _load_templates_fresh() -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT template_key, version, display_name, description,
                   env_kind_default, industry_type, default_home_route, default_auth_mode,
                   enabled_modules, theme_tokens, login_copy,
                   default_seed_pack, available_seed_packs,
                   is_active, is_latest, notes
              FROM app.environment_templates
             WHERE is_active = true
             ORDER BY template_key, version DESC
            """
        )
        return [dict(r) for r in cur.fetchall()]


def list_templates(*, force_refresh: bool = False) -> list[dict[str, Any]]:
    now = time.time()
    if (
        force_refresh
        or _CACHE["templates"] is None
        or now - _CACHE["fetched_at"] > _CACHE_TTL_SECONDS
    ):
        _CACHE["templates"] = _load_templates_fresh()
        _CACHE["fetched_at"] = now
    return list(_CACHE["templates"])


def get_template(template_key: str, version: int | None = None) -> dict[str, Any]:
    """Fetch a single template. If version is None, returns the row flagged is_latest.

    Raises LookupError if not found.
    """
    templates = list_templates()
    candidates = [t for t in templates if t["template_key"] == template_key]
    if not candidates:
        raise LookupError(f"Unknown template_key: {template_key}")
    if version is None:
        for t in candidates:
            if t.get("is_latest"):
                return t
        return candidates[0]
    for t in candidates:
        if t["version"] == version:
            return t
    raise LookupError(f"Template {template_key} has no version {version}")


def invalidate_cache() -> None:
    _CACHE["templates"] = None
    _CACHE["fetched_at"] = 0.0
