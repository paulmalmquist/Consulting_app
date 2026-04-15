"""Starter seed for client delivery / PDS environments.

Pattern mined from stone-pds. Adds a delivery-oriented pipeline so the
workspace is not empty on first load.
"""

from __future__ import annotations

from . import SeedResult


NAME = "client_delivery_starter"
VERSION = 1


_STAGES: list[tuple[str, str, int, str]] = [
    ("discovery", "Discovery", 0, "slate"),
    ("in_flight", "In Flight", 1, "blue"),
    ("review", "Review", 2, "amber"),
    ("delivered", "Delivered", 3, "green"),
]


def apply(cur, env_id: str, business_id: str, *, actor: str) -> SeedResult:
    rows: dict[str, int] = {}
    notes: list[str] = []

    try:
        for key, label, sort_order, color in _STAGES:
            cur.execute(
                """
                INSERT INTO v1.pipeline_stages (env_id, key, label, sort_order, color_token)
                VALUES (%s::uuid, %s, %s, %s, %s)
                ON CONFLICT (env_id, key) DO NOTHING
                """,
                (env_id, key, label, sort_order, color),
            )
        rows["v1.pipeline_stages"] = len(_STAGES)
    except Exception as exc:
        notes.append(f"skipped pipeline_stages seed: {exc}")

    return SeedResult(
        pack_name=NAME,
        pack_version=VERSION,
        rows_created=rows,
        notes=notes
        or [
            "client_delivery_starter: delivery-oriented pipeline stages seeded.",
            "Richer project/budget seed deferred — layer via a second pack when needed.",
        ],
    )
