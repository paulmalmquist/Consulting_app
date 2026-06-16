"""History Rhymes — ML Algorithm Decision Lab API.

Prefix: /api/hr/v1/ml-demo  (the /api/hr/v1 namespace is the only HR-compliant
one; /api/historyrhymes/* is forbidden by the frontend contract test.)

A teaching/demo surface: 10 classic ML algorithms trained deterministically on
synthetic HR-flavored data. Single-tenant (no env_id/RLS, HR exemption). Fails
closed: every handler returns HTTP 200 with a structured payload, never 5xx; an
unknown algorithm id returns a `not_available` envelope, not a 404.

See also:
    - backend/app/services/hr_ml_demo/   (dataset, registry, trainers, runner)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request

from app.services.hr_ml_demo import (
    build_compare,
    build_overview,
    get_dataset_profile,
    run_algorithm,
    run_all_algorithms,
)
from app.services.hr_ml_demo.registry import ALGORITHM_DEMOS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hr/v1/ml-demo", tags=["history-rhymes-ml-demo"])


def _parse_scenario_query(request: Request) -> dict[str, Any] | None:
    """Build a Reality Mode scenario from query params (?toggle=a&toggle=b...)."""
    toggles = request.query_params.getlist("toggle")
    if not toggles:
        return None
    scenario: dict[str, Any] = {"toggles": toggles}
    for key in ("fp_cost", "fn_cost", "confidence_threshold", "latency_budget_ms"):
        val = request.query_params.get(key)
        if val is not None:
            try:
                scenario[key] = float(val)
            except ValueError:
                pass
    split_mode = request.query_params.get("split_mode")
    if split_mode:
        scenario["split_mode"] = split_mode
    return scenario


@router.get("/overview")
def overview() -> dict[str, Any]:
    try:
        return build_overview()
    except Exception:  # noqa: BLE001 — fail closed
        logger.exception("ml-demo overview failed")
        return {"title": "ML Algorithm Decision Lab", "algorithms": [], "error": True}


@router.get("/dataset")
def dataset() -> dict[str, Any]:
    try:
        return get_dataset_profile()
    except Exception:  # noqa: BLE001
        logger.exception("ml-demo dataset profile failed")
        return {"n_rows": 0, "columns": [], "error": True}


@router.get("/algorithms")
def algorithms(request: Request) -> dict[str, Any]:
    try:
        return run_all_algorithms(_parse_scenario_query(request))
    except Exception:  # noqa: BLE001
        logger.exception("ml-demo run_all failed")
        return {"algorithms": []}


@router.get("/algorithms/{algorithm_id}")
def algorithm_detail(algorithm_id: str, request: Request) -> dict[str, Any]:
    return run_algorithm(algorithm_id, _parse_scenario_query(request))


@router.get("/compare")
def compare(request: Request) -> dict[str, Any]:
    try:
        return build_compare(_parse_scenario_query(request))
    except Exception:  # noqa: BLE001
        logger.exception("ml-demo compare failed")
        return {"dimensions": [], "rows": []}


@router.get("/curveballs")
def curveballs() -> dict[str, Any]:
    try:
        from app.services.hr_ml_demo.curveballs import REALITY_CURVEBALLS

        return {"curveballs": REALITY_CURVEBALLS}
    except Exception:  # curveball engine not present yet / failed
        return {"curveballs": []}


@router.get("/cloud-config")
def cloud_config() -> dict[str, Any]:
    try:
        from app.services.hr_ml_demo.cloud_links import public_cloud_config

        return public_cloud_config()
    except Exception:
        return {"provider": "none", "available_link_types": []}


@router.post("/run")
async def run(request: Request) -> dict[str, Any]:
    """Run one algorithm under an optional Reality Mode scenario.

    Body: {"algorithm_id": "...", "scenario": {...}}. Malformed bodies fail
    closed to a structured payload (HTTP 200), consistent with the HR contract.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    algorithm_id = body.get("algorithm_id")
    scenario = body.get("scenario") if isinstance(body.get("scenario"), dict) else None
    if not algorithm_id or not isinstance(algorithm_id, str):
        return {
            "algorithm_id": None,
            "status": "not_available",
            "null_reason": "missing_algorithm_id: provide {'algorithm_id': '<id>'}",
            "valid_ids": [d["id"] for d in ALGORITHM_DEMOS],
        }
    return run_algorithm(algorithm_id, scenario)
