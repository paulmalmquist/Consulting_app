"""Feature lineage + external links — reuses hr_ml_demo.cloud_links.

Source → transform → gold. Links never fabricate href (provider=none ⇒ disabled
+ unavailableReason + copyValue), exactly like the ML lab.
"""

from __future__ import annotations

from typing import Any

from app.services.hr_ml_demo.cloud_links import (
    ResourceRef,
    build_external_links,
    provider_config,
)

GOLD_TABLE = "hr_history_rhymes_model_observations"


def feature_external_links(cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    cfg = cfg or provider_config()
    return build_external_links(
        ResourceRef(resource_type="table", name=GOLD_TABLE, table=GOLD_TABLE,
                    dataset=cfg.get("bigquery_dataset")),
        cfg,
    )


def feature_lineage(feature: dict[str, Any], cfg: dict[str, str] | None = None) -> dict[str, Any]:
    cfg = cfg or provider_config()
    gold = ResourceRef(resource_type="table", name=GOLD_TABLE, table=GOLD_TABLE,
                       dataset=cfg.get("bigquery_dataset"))
    deps = feature.get("source_dependencies", [])
    return {
        "source_tables": [
            {
                "name": GOLD_TABLE,
                "grain": "one row per (observation_id, as_of_date, model_obs_version)",
                "freshness": "deterministic (seed=42, Phase A synthetic)",
                "external_links": build_external_links(gold, cfg),
            }
        ],
        "transform_steps": [
            {"name": "normalize", "type": "python_service",
             "description": "trailing-2y z-score per canonical feature (encoder input)"},
            {"name": f"enrich:{feature.get('family')}", "type": "feature_engineering",
             "description": feature.get("formula", "")},
        ],
        "inputs": deps,
        "model_artifacts": [],
    }
