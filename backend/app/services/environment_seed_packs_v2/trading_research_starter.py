"""Starter seed for trading / research environments.

Pattern mined from the trading environment + History Rhymes research workflows.
Minimal: just sets up a research-oriented pipeline.
"""

from __future__ import annotations

from . import SeedResult


NAME = "trading_research_starter"
VERSION = 1


_STAGES: list[tuple[str, str, int, str]] = [
    ("hypothesis", "Hypothesis", 0, "slate"),
    ("research", "Research", 1, "blue"),
    ("backtest", "Backtest", 2, "amber"),
    ("paper_trade", "Paper Trade", 3, "purple"),
    ("live", "Live", 4, "green"),
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
            "trading_research_starter: research pipeline stages seeded.",
            "Strategy / backtest / signal fixtures deferred to a richer pack.",
        ],
    )
