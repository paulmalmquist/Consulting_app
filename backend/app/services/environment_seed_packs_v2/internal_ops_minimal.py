"""Minimal internal-ops seed — a handful of CRM/tasks placeholders.

Pattern mined from novendor. Kept deliberately small; callers who want
realistic demo data should layer a richer pack later.
"""

from __future__ import annotations

from . import SeedResult


NAME = "internal_ops_minimal"
VERSION = 1


_STAGES: list[tuple[str, str, int, str]] = [
    ("lead", "Lead", 0, "slate"),
    ("qualified", "Qualified", 1, "blue"),
    ("proposal", "Proposal", 2, "amber"),
    ("negotiation", "Negotiation", 3, "purple"),
    ("closed_won", "Closed Won", 4, "green"),
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
        notes=notes or ["internal_ops_minimal: consulting-oriented pipeline stages seeded"],
    )
