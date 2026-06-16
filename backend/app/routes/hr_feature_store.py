"""History Rhymes — Episode Feature Store / Feature Observatory API (Phase 0).

Prefix: /api/hr/v1/features  (the /api/hr/v1 namespace is the only HR-compliant
one; /api/historyrhymes/* is forbidden by the frontend contract test.)

Single-tenant (no env_id/RLS — HR exemption; episode_* are shared dimensions).
Fails closed: every handler returns HTTP 200 with a structured payload, never 5xx.

Endpoints:
    GET /api/hr/v1/features/episodes
        — episodes that have feature-store rows (for the Observatory selector)
    GET /api/hr/v1/features/episodes/{episode_id}/observatory
        — the 5 Observatory bands for one episode

The Observatory bands map to the build maturity:
    raw_inputs / derived_features / model_outputs  -> live now (Phase 0)
    analog_matches    -> planned (Phase 4: pgvector episode_embeddings)
    forecast_performance -> planned (Phase 5: calibration)
Planned bands return an honest not_available status, never fake numbers.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.db import get_cursor
from app.services.hr_features.model import run_smoke_model

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hr/v1/features", tags=["history-rhymes-feature-store"])


@router.get("/episodes")
def list_episodes() -> dict[str, Any]:
    """Episodes that currently have feature-store rows."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT e.id::text AS id, e.name AS name, e.is_non_event AS is_non_event,
                       MIN(f.as_of_date)::text AS as_of,
                       COUNT(DISTINCT f.feature_id) AS feature_count
                FROM public.episode_features f
                JOIN public.episodes e ON e.id = f.entity_id
                GROUP BY e.id, e.name, e.is_non_event
                ORDER BY e.name;
                """
            )
            episodes = [dict(r) for r in cur.fetchall()]
        return {"status": "ok", "episodes": episodes, "null_reason": None}
    except Exception:  # noqa: BLE001 — fail closed
        logger.exception("feature-store list_episodes failed")
        return {"status": "not_available", "episodes": [], "null_reason": "query_failed"}


@router.get("/episodes/{episode_id}/observatory")
def observatory(episode_id: str) -> dict[str, Any]:
    """The five Feature Observatory bands for one episode (fail-closed)."""
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT id::text AS id, name, start_date::text AS as_of, is_non_event "
                "FROM public.episodes WHERE id = %s;",
                (episode_id,),
            )
            ep = cur.fetchone()
            if ep is None:
                return {"status": "not_available", "null_reason": "episode_not_found",
                        "episode_id": episode_id}

            cur.execute(
                """
                SELECT f.feature_id, r.feature_name, r.family, r.transform, r.unit,
                       r.raw_sources, f.value, f.value_label, f.null_reason,
                       f.data_provenance
                FROM public.episode_features f
                JOIN public.feature_registry r ON r.feature_id = f.feature_id
                WHERE f.entity_id = %s
                ORDER BY r.family, f.feature_id;
                """,
                (episode_id,),
            )
            feats = [dict(r) for r in cur.fetchall()]

            cur.execute(
                "SELECT target_name, horizon_days, value, null_reason, source_lineage "
                "FROM public.episode_targets WHERE entity_id = %s ORDER BY target_name;",
                (episode_id,),
            )
            targets = [dict(r) for r in cur.fetchall()]

            model = run_smoke_model(cur)

        if not feats:
            return {"status": "not_available", "null_reason": "no_features_for_episode",
                    "episode": ep, "episode_id": episode_id}

        provenance = sorted({f["data_provenance"] for f in feats})

        # Band 1: raw inputs — the source series behind the features, by family.
        raw_by_family: dict[str, set] = {}
        for f in feats:
            raw_by_family.setdefault(f["family"], set()).update(f.get("raw_sources") or [])
        raw_inputs = [{"family": fam, "raw_sources": sorted(src)}
                      for fam, src in sorted(raw_by_family.items())]

        # Band 3: model outputs — this episode's slice of the smoke model.
        ep_pred = next((e for e in model.get("episodes", [])
                        if e["episode_id"] == episode_id), None)
        model_outputs = {
            "status": model.get("status"),
            "status_label": model.get("status_label", "pipeline smoke model"),
            "training_basis": model.get("training_basis"),
            "purpose": model.get("purpose"),
            "calibrated": model.get("calibrated", False),
            "model": model.get("model"),
            "target": model.get("target"),
            "features_used": model.get("features", []),
            "features_dropped": model.get("features_dropped", []),
            "note": model.get("note"),
            "recession_flag": ep_pred["recession_flag"] if ep_pred else None,
            "recession_probability": ep_pred["recession_probability"] if ep_pred else None,
            "null_reason": None if ep_pred else model.get("null_reason", "no_prediction"),
        }

        # Band 0: data coverage — turn missing data into a visible trust signal.
        feat_unavailable = [
            {"kind": "feature", "id": f["feature_id"], "reason": f["null_reason"]}
            for f in feats if f["null_reason"] is not None
        ]
        tgt_unavailable = [
            {"kind": "target", "id": t["target_name"], "reason": t["null_reason"]}
            for t in targets if t["null_reason"] is not None
        ]
        coverage = {
            "features_available": sum(1 for f in feats if f["null_reason"] is None),
            "features_total": len(feats),
            "targets_available": sum(1 for t in targets if t["null_reason"] is None),
            "targets_total": len(targets),
            "unavailable": feat_unavailable + tgt_unavailable,
        }

        return {
            "status": "ok",
            "model_status": "experimental",  # Phase 0: pipeline smoke, not calibrated
            "data_provenance": provenance,
            "episode": ep,
            "coverage": coverage,
            "bands": {
                "raw_inputs": raw_inputs,
                "derived_features": feats,
                "model_outputs": model_outputs,
                "analog_matches": {"status": "not_available",
                                   "null_reason": "planned_phase_4_pgvector_embeddings",
                                   "items": []},
                "forecast_performance": {"status": "not_available",
                                         "null_reason": "planned_phase_5_calibration",
                                         "metrics": {}},
            },
            "targets": targets,
            "null_reason": None,
        }
    except Exception:  # noqa: BLE001 — fail closed
        logger.exception("feature-store observatory failed for %s", episode_id)
        return {"status": "not_available", "null_reason": "query_failed",
                "episode_id": episode_id}
