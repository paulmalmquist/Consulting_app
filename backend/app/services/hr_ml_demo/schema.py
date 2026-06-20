"""Shared constants and response builders for the ML Algorithm Decision Lab.

Every algorithm response is a flat envelope (see `ok_response` /
`not_available_response`). The service NEVER raises to the route; a failed
algorithm returns `status="not_available"` with a non-null `null_reason` while
keeping its static `model_card` intact, so the page degrades one card at a time.
"""

from __future__ import annotations

from typing import Any

SEED = 42
MODEL_VERSION = "ml-demo-v1"
SOURCE = "synthetic"


def _round(value: Any, ndigits: int = 4) -> Any:
    """Round floats for byte-stable JSON; pass through everything else."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int,)):
        return value
    if isinstance(value, float):
        return round(value, ndigits)
    return value


def round_floats(obj: Any, ndigits: int = 4) -> Any:
    """Recursively round floats inside dicts/lists for deterministic output."""
    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [round_floats(v, ndigits) for v in obj]
    return _round(obj, ndigits)


def evidence_block(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    block = {"seed": SEED, "model_version": MODEL_VERSION, "source": SOURCE}
    if extra:
        block.update(extra)
    return block


def _model_card(demo: dict[str, Any]) -> dict[str, Any]:
    card = dict(demo.get("model_card", {}))
    card["fit_score_dimensions"] = dict(demo.get("fit_score_dimensions", {}))
    return card


def ok_response(demo: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """Build a successful per-algorithm envelope from a trainer result.

    The `reality` overlay is only attached when a Reality Mode scenario produced
    one, so the clean-run envelope stays stable.
    """
    envelope = {
        "algorithm_id": demo["id"],
        "name": demo["name"],
        "status": "ok",
        "null_reason": None,
        "task_type": demo["task_type"],
        "business_question": demo["business_question"],
        "dataset": round_floats(result.get("dataset", {})),
        "metrics": round_floats(result.get("metrics", {})),
        "charts": round_floats(result.get("charts", {})),
        "model_card": _model_card(demo),
        "evidence": evidence_block(result.get("evidence")),
        "external_links": result.get("external_links", []),
        "lineage": result.get("lineage", {}),
    }
    if result.get("reality") is not None:
        envelope["reality"] = round_floats(result["reality"])
    return envelope


def not_available_response(
    demo: dict[str, Any], null_reason: str
) -> dict[str, Any]:
    """Per-algorithm envelope for a failed/unavailable algorithm.

    Static teaching content (model_card) survives; metrics/charts are emptied.
    """
    return {
        "algorithm_id": demo["id"],
        "name": demo["name"],
        "status": "not_available",
        "null_reason": null_reason,
        "task_type": demo.get("task_type"),
        "business_question": demo.get("business_question"),
        "dataset": {},
        "metrics": {},
        "charts": {},
        "model_card": _model_card(demo),
        "evidence": evidence_block(),
        "external_links": [],
        "lineage": {},
    }


def not_found_response(algorithm_id: str) -> dict[str, Any]:
    """Envelope for an unknown algorithm id (route returns 200, never 404)."""
    return {
        "algorithm_id": algorithm_id,
        "name": algorithm_id,
        "status": "not_available",
        "null_reason": f"unknown_algorithm: {algorithm_id!r} is not registered",
        "task_type": None,
        "business_question": None,
        "dataset": {},
        "metrics": {},
        "charts": {},
        "model_card": {},
        "evidence": evidence_block(),
        "external_links": [],
        "lineage": {},
    }


def safe_reason(exc: Exception) -> str:
    """Short, non-leaking failure reason (class + message head, no traceback)."""
    msg = str(exc).strip().splitlines()[0] if str(exc).strip() else ""
    msg = msg[:160]
    return f"training_failed: {type(exc).__name__}" + (f": {msg}" if msg else "")
