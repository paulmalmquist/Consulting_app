"""Orchestration for the ML Algorithm Decision Lab.

Public API (re-exported from the package __init__):
  run_algorithm / run_all_algorithms / build_compare / build_overview /
  get_dataset_profile.

Every algorithm runs fail-closed: a failure inside one trainer returns a
`not_available` envelope for that algorithm only, never an exception to the
route, never a broken page. A `scenario` (Reality Mode toggles) is applied to a
COPY of the dataset before training; with no scenario the base dataset is used.
"""

from __future__ import annotations

import logging
from typing import Any

from .dataset import generate_dataset, get_dataset_profile
from .registry import ALGORITHM_DEMOS, get_demo
from .schema import SEED, evidence_block, not_available_response, not_found_response, ok_response, safe_reason
from .trainers import TRAINERS

logger = logging.getLogger(__name__)

HOW_TO_CHOOSE: list[dict[str, str]] = [
    {"need": "A number (continuous outcome)", "use": "Start with Linear Regression, compare against Random Forest."},
    {"need": "A yes/no probability", "use": "Start with Logistic Regression, compare against Tree / Forest / SVM."},
    {"need": "Interpretable rules", "use": "Use a Decision Tree."},
    {"need": "Robust tabular performance", "use": "Use Random Forest."},
    {"need": "Similarity to past states", "use": "Use KNN, then compare to History Rhymes Rhyme Score."},
    {"need": "Text theme classification", "use": "Use Naive Bayes as a baseline."},
    {"need": "Hidden segments", "use": "Use K-Means or Hierarchical Clustering."},
    {"need": "Visualization / compression", "use": "Use PCA."},
    {"need": "Production confidence", "use": "Model cards + baselines + calibration + fail-closed data checks."},
]

DEMO_SCRIPT: dict[str, list[str]] = {
    "three_minute": [
        "Open the comparison matrix: same data, different constraints, different winners.",
        "Pick 'Classify risk' — show Logistic vs Forest vs SVM tradeoffs.",
        "Toggle class imbalance: accuracy stays high while recall collapses.",
        "Land the line: accuracy is often the least useful metric.",
    ],
    "eight_minute": [
        "Start at the dataset profile — synthetic, deterministic, HR-flavored signals.",
        "Walk the four task families: regression, classification, text, unsupervised.",
        "Open Linear Regression: transparent baseline, weak on nonlinear regimes.",
        "Open Random Forest: stronger, less interpretable; show feature importance.",
        "Open KNN: nearest analogs — contrast with the governed History Rhymes engine.",
        "Open PCA: variance is not importance; rare risk can hide in low-variance components.",
        "Enter Reality Mode: leakage trap, stale features, regime shift, cost-of-error.",
        "Close on model selection as system design, not a leaderboard.",
    ],
    "interview_talk_track": [
        "The question is never 'which model is most advanced' — it's which fits the data, constraint, and cost of being wrong.",
        "A simple model with known limitations beats a complex model that adds noise and false confidence.",
        "Production confidence comes from baselines, honest metrics, and fail-closed data checks — not model complexity.",
    ],
}


# Shared dataset provenance (computed once). The lab now trains on the feature
# store's shared deterministic frame; if that package is unavailable we FALL BACK
# to the lab's own generator and badge it LOUDLY so a degraded run is never
# mistaken for the one-shared-dataset path.
_SHARED: tuple[Any, dict[str, Any]] | None = None


def _shared_base() -> tuple[Any, dict[str, Any]]:
    global _SHARED
    if _SHARED is None:
        try:
            from app.services.hr_feature_store import lab_model_dataset  # noqa: PLC0415

            _SHARED = (
                lab_model_dataset(SEED),
                {"source_quality": "synthetic", "dataset_provenance": "hr_feature_store", "fallback_reason": None},
            )
        except Exception:  # noqa: BLE001 — loud fallback, never break the lab
            logger.exception("hr_feature_store unavailable; falling back to lab generate_dataset")
            _SHARED = (
                generate_dataset(SEED),
                {"source_quality": "synthetic_fallback", "dataset_provenance": "lab_generate_dataset",
                 "fallback_reason": "hr_feature_store_unavailable"},
            )
    return _SHARED


def dataset_provenance() -> dict[str, Any]:
    return dict(_shared_base()[1])


def reset_dataset_cache() -> None:
    """Test hook: drop the memoized shared dataset so provenance re-resolves."""
    global _SHARED
    _SHARED = None


def _prepare_dataset(scenario: dict[str, Any] | None):
    """Return the dataset for a run; Reality Mode mutations are applied here.

    Consumes the feature store's shared deterministic frame (fail-soft to the
    lab's own generator). Curveballs are applied to a copy.
    """
    base = _shared_base()[0]
    if not scenario:
        return base
    try:
        from .curveballs import apply_scenario  # noqa: PLC0415
    except Exception:  # curveball engine not present
        return base
    return apply_scenario(base.copy(), scenario)


def run_algorithm(algorithm_id: str, scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run one algorithm; fail-closed to a `not_available` envelope on error."""
    demo = get_demo(algorithm_id)
    if demo is None:
        return not_found_response(algorithm_id)
    try:
        df = _prepare_dataset(scenario)
        trainer = TRAINERS[demo["task_family"]]
        result = trainer(df, demo, scenario)
        # Reality Mode may attach honest-metric overlays post-training.
        if scenario:
            _augment_with_scenario(result, demo, df, scenario)
        envelope = ok_response(demo, result)
        _attach_cloud(envelope, algorithm_id)
        # Badge dataset provenance inside evidence (keeps top-level envelope keys stable).
        prov = dataset_provenance()
        envelope["evidence"]["source_quality"] = prov["source_quality"]
        envelope["evidence"]["dataset_provenance"] = prov["dataset_provenance"]
        if prov.get("fallback_reason"):
            envelope["evidence"]["fallback_reason"] = prov["fallback_reason"]
        return envelope
    except Exception as exc:  # noqa: BLE001 — per-algorithm fail-closed
        logger.exception("ml-demo algorithm %s failed", algorithm_id)
        return not_available_response(demo, safe_reason(exc))


def _augment_with_scenario(result: dict[str, Any], demo: dict[str, Any], df, scenario: dict[str, Any]) -> None:
    try:
        from .curveballs import augment_result  # noqa: PLC0415
    except Exception:
        return
    augment_result(result, demo, df, scenario)


def _attach_cloud(envelope: dict[str, Any], algorithm_id: str) -> None:
    """Attach external_links + lineage (provenance). Evidence-only; never fatal."""
    try:
        from .cloud_links import build_lineage, model_links  # noqa: PLC0415

        envelope["external_links"] = model_links(algorithm_id)
        envelope["lineage"] = build_lineage(algorithm_id)
    except Exception:  # noqa: BLE001
        logger.exception("ml-demo cloud link build failed for %s", algorithm_id)


def run_all_algorithms(scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    algos = [run_algorithm(d["id"], scenario) for d in ALGORITHM_DEMOS]
    out: dict[str, Any] = {"algorithms": algos}
    if scenario:
        out["disagreement"] = _disagreement_index(algos)
    return out


def _disagreement_index(algos: list[dict[str, Any]]) -> dict[str, Any]:
    """Share of supervised models that diverge from the majority directional read."""
    reads: list[tuple[str, str]] = []
    for a in algos:
        read = (a.get("reality") or {}).get("directional_read")
        if read:
            reads.append((a["algorithm_id"], read))
    if not reads:
        return {"index": 0.0, "reads": [], "note": "No directional reads available."}
    values = [r for _, r in reads]
    majority = max(set(values), key=values.count)
    minority = sum(1 for v in values if v != majority)
    return {
        "index": round(minority / len(values), 4),
        "majority": majority,
        "reads": [{"algorithm_id": aid, "read": r} for aid, r in reads],
        "note": "Disagreement is information, not a bug.",
    }


_HEADLINE_METRIC = {
    "regression": ("r2", "R²"),
    "classification": ("f1", "F1"),
    "text_classification": ("f1_macro", "F1 (macro)"),
    "clustering": ("silhouette", "Silhouette"),
    "dim_reduction": (None, "Cumulative variance"),
}


def _headline(algo: dict[str, Any]) -> dict[str, Any]:
    task = algo.get("task_type")
    key, label = _HEADLINE_METRIC.get(task, (None, ""))
    metrics = algo.get("metrics", {})
    if algo.get("status") != "ok":
        return {"label": label, "value": None}
    if task == "dim_reduction":
        cum = metrics.get("cumulative_explained_variance") or []
        return {"label": label, "value": round(float(cum[-1]), 4) if cum else None}
    val = metrics.get(key) if key else None
    return {"label": label, "value": val}


COMPARE_DIMENSIONS = [
    "interpretability",
    "handles_nonlinearity",
    "handles_high_dim",
    "training_speed",
    "robust_to_outliers",
    "needs_scaling",
]


def build_compare(scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    algos = run_all_algorithms(scenario)["algorithms"]
    rows = []
    for a in algos:
        demo = get_demo(a["algorithm_id"]) or {}
        rows.append(
            {
                "algorithm_id": a["algorithm_id"],
                "name": a["name"],
                "task_type": a.get("task_type"),
                "status": a.get("status"),
                "fit_score_dimensions": demo.get("fit_score_dimensions", {}),
                "headline_metric": _headline(a),
            }
        )
    return {"dimensions": COMPARE_DIMENSIONS, "rows": rows}


def active_cloud_provider() -> str:
    try:
        from .cloud_config import ML_DEMO_CLOUD_PROVIDER  # noqa: PLC0415

        return ML_DEMO_CLOUD_PROVIDER
    except Exception:
        return "none"


def build_overview() -> dict[str, Any]:
    profile = get_dataset_profile(SEED)
    algos = run_all_algorithms()["algorithms"]

    task_families: dict[str, int] = {}
    for d in ALGORITHM_DEMOS:
        task_families[d["task_type"]] = task_families.get(d["task_type"], 0) + 1

    best_regression = next(
        (a for a in algos if a["task_type"] == "regression" and a["status"] == "ok"), None
    )
    best_classification = max(
        (a for a in algos if a["task_type"] == "classification" and a["status"] == "ok"),
        key=lambda a: a["metrics"].get("f1", 0) or 0,
        default=None,
    )

    summaries = [
        {
            "algorithm_id": a["algorithm_id"],
            "name": a["name"],
            "task_type": a["task_type"],
            "status": a["status"],
            "headline_metric": _headline(a),
            "business_question": a.get("business_question"),
        }
        for a in algos
    ]

    return {
        "title": "ML Algorithm Decision Lab",
        "subtitle": "Same data. Different constraints. Different model choices.",
        "lesson": (
            "The model choice is part of the system design. A simple model that "
            "answers the right question with known limitations beats a complex "
            "model that adds noise, latency, and false confidence."
        ),
        "hero_metrics": {
            "n_rows": profile["n_rows"],
            "n_features": profile["n_features"],
            "algorithms_available": sum(1 for a in algos if a["status"] == "ok"),
            "algorithms_total": len(algos),
            "best_regression": {
                "name": best_regression["name"] if best_regression else None,
                "headline": _headline(best_regression) if best_regression else None,
            },
            "best_classification": {
                "name": best_classification["name"] if best_classification else None,
                "headline": _headline(best_classification) if best_classification else None,
            },
            "data_freshness": "synthetic_deterministic",
        },
        "task_families": task_families,
        "algorithms": summaries,
        "how_to_choose": HOW_TO_CHOOSE,
        "demo_script": DEMO_SCRIPT,
        "cloud_provider": active_cloud_provider(),
        "evidence": evidence_block(),
    }
