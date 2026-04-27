"""Starter seed for supply chain data platform environments.

Mirrors client_delivery_starter — deterministic, idempotent, and minimal in
this first pass. Seeds the lakehouse-build pipeline stages so the workspace
is not empty on first load. Richer rows (sources, pipelines, products) are
served by frontend-local typed seed for now.
"""

from __future__ import annotations

from . import SeedResult


NAME = "supply_chain_starter"
VERSION = 1


_STAGES: list[tuple[str, str, int, str]] = [
    ("discovery", "Discovery", 0, "slate"),
    ("bronze", "Bronze Ingestion", 1, "amber"),
    ("silver", "Silver Conformed", 2, "slate"),
    ("gold", "Gold Data Products", 3, "yellow"),
    ("hardening", "Governance & Hardening", 4, "blue"),
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
            "supply_chain_starter: lakehouse-build pipeline stages seeded.",
            "Source systems, medallion tables, data products served by frontend-local seed in repo-b/src/lib/supply-chain/seed.ts.",
        ],
    )
