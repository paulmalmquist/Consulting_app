"""Starter seed for telemetry anomaly platform environments.

Mirrors supply_chain_starter — deterministic, idempotent, minimal. Seeds the medallion→serving
pipeline stages so the workspace is not empty on first load. The operational telemetry data (test
runs, channels, model runs, predictions) lives in the tel_* tables seeded for the serving tenant;
the dashboard reads it through /api/telemetry/*.
"""

from __future__ import annotations

from . import SeedResult


NAME = "telemetry_starter"
VERSION = 1


_STAGES: list[tuple[str, str, int, str]] = [
    ("ingest", "Bronze Ingestion", 0, "amber"),
    ("features", "Silver / Gold Features", 1, "slate"),
    ("train", "MLflow Training", 2, "blue"),
    ("registry", "Registry + Gate", 3, "yellow"),
    ("serving", "Serving + Monitoring", 4, "slate"),
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
            "telemetry_starter: ingest→features→train→registry→serving pipeline stages seeded.",
            "Operational telemetry data (tel_* tables) served via /api/telemetry/*; replay reads the "
            "precomputed champion feed fixture.",
        ],
    )
