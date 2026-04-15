"""Starter seed for REPE environments.

Pattern mined from meridian. This pack intentionally does NOT write to
re_authoritative_snapshots or generate authoritative state — that remains
the responsibility of the snapshot service (see docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md).

This pack writes only structural rows (deal pipeline stages) that provide a coherent
empty workspace. Realistic fund/asset data is deferred to a dedicated pack.
"""

from __future__ import annotations

from . import SeedResult


NAME = "repe_starter"
VERSION = 1


_STAGES: list[tuple[str, str, int, str]] = [
    ("sourcing", "Sourcing", 0, "slate"),
    ("screening", "Screening", 1, "blue"),
    ("underwriting", "Underwriting", 2, "amber"),
    ("ic_approved", "IC Approved", 3, "purple"),
    ("closed", "Closed", 4, "green"),
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

    notes.append(
        "repe_starter: REPE deal-pipeline stages only. "
        "Fund/asset/investor seed deferred — use seed_repe_workspace() or a richer pack when ready."
    )
    notes.append(
        "AUTHORITATIVE STATE: this pack does NOT write re_authoritative_snapshots. "
        "New REPE envs must go through the snapshot service for released periods."
    )
    return SeedResult(
        pack_name=NAME, pack_version=VERSION, rows_created=rows, notes=notes
    )
