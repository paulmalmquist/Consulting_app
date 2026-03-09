"""Shared waterfall stress template catalog."""
from __future__ import annotations

from difflib import get_close_matches
from typing import Any

from app.db import get_cursor


TEMPLATES: dict[str, dict[str, Any]] = {
    "covid_stress": {
        "name": "covid_stress",
        "description": "150 bps cap-rate expansion, 15% NOI stress, and a 12 month exit delay.",
        "cap_rate_delta_bps": 150,
        "noi_stress_pct": -0.15,
        "exit_date_shift_months": 12,
        "is_system": True,
    },
    "rate_shock_200": {
        "name": "rate_shock_200",
        "description": "200 bps cap-rate expansion with a mild NOI drag.",
        "cap_rate_delta_bps": 200,
        "noi_stress_pct": -0.05,
        "exit_date_shift_months": 0,
        "is_system": True,
    },
    "delayed_exit_18mo": {
        "name": "delayed_exit_18mo",
        "description": "Base operations with an 18 month exit delay.",
        "cap_rate_delta_bps": 0,
        "noi_stress_pct": 0,
        "exit_date_shift_months": 18,
        "is_system": True,
    },
    "mild_downside": {
        "name": "mild_downside",
        "description": "50 bps cap-rate expansion, 3% NOI stress, and a 6 month exit delay.",
        "cap_rate_delta_bps": 50,
        "noi_stress_pct": -0.03,
        "exit_date_shift_months": 6,
        "is_system": True,
    },
    "deep_recession": {
        "name": "deep_recession",
        "description": "250 bps cap-rate expansion, 25% NOI stress, and a 24 month exit delay.",
        "cap_rate_delta_bps": 250,
        "noi_stress_pct": -0.25,
        "exit_date_shift_months": 24,
        "is_system": True,
    },
}


def _normalize_name(name: str | None) -> str:
    return (name or "").strip().lower().replace(" ", "_").replace("-", "_")


def list_templates(*, env_id: str | None = None) -> list[dict[str, Any]]:
    rows = [dict(value) for value in TEMPLATES.values()]
    if env_id:
        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT name, description, cap_rate_delta_bps, noi_stress_pct,
                           exit_date_shift_months, is_system, env_id
                    FROM re_scenario_template
                    WHERE env_id::text = %s OR env_id IS NULL
                    ORDER BY is_system DESC, name
                    """,
                    (env_id,),
                )
                for row in cur.fetchall():
                    rows.append({
                        "name": row["name"],
                        "description": row.get("description"),
                        "cap_rate_delta_bps": row.get("cap_rate_delta_bps") or 0,
                        "noi_stress_pct": float(row.get("noi_stress_pct") or 0),
                        "exit_date_shift_months": row.get("exit_date_shift_months") or 0,
                        "is_system": bool(row.get("is_system", False)),
                        "env_id": str(row["env_id"]) if row.get("env_id") else None,
                    })
        except Exception:
            pass

    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        deduped[_normalize_name(row["name"])] = row
    return list(deduped.values())


def resolve_template(name: str, *, env_id: str | None = None) -> dict[str, Any] | None:
    normalized = _normalize_name(name)
    if not normalized:
        return None

    templates = list_templates(env_id=env_id)
    by_name = {_normalize_name(item["name"]): item for item in templates}
    if normalized in by_name:
        return by_name[normalized]

    matches = get_close_matches(normalized, by_name.keys(), n=1, cutoff=0.55)
    if matches:
        return by_name[matches[0]]

    for key, item in by_name.items():
        if normalized in key or key in normalized:
            return item
    return None
