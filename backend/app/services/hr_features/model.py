"""Phase 0 pipeline smoke model (History Rhymes Episode Feature Store).

Proves the feature -> target -> train -> score -> display loop end to end on REAL
episode rows. It is deliberately a **smoke model, NOT a production-calibrated
forecaster**: 3 episodes is not a trainable population, so it fits in-sample and
reports `status='experimental'`, `calibrated=False`. Real predictive value comes
only after the episode/as_of population is expanded (Phase 1+).

Same estimator family the synthetic ML lab uses (RandomForestClassifier, fixed
seed). `train_smoke(frame)` is pure (no DB) so it is unit-testable; `run_smoke_model`
loads the frame from the feature store.
"""

from __future__ import annotations

from typing import Any

from app.db import get_cursor

# Numeric features the smoke classifier uses (deterministic order). yc_regime is
# categorical (its numeric value duplicates yc_slope) so it is excluded here.
SMOKE_FEATURES = [
    "yc_slope", "yc_velocity", "yc_acceleration", "yc_zscore",
    "credit_spread_velocity", "housing_velocity",
]
TARGET = "recession_flag"
SEED = 42


def load_episode_frame(cur) -> list[dict[str, Any]]:
    """Wide frame: one row per episode with the numeric features + recession_flag.

    Only episodes whose features are all present (non-null) and that have a
    recession_flag target are returned — fail closed on incomplete rows."""
    cur.execute(
        """
        SELECT f.entity_id::text AS episode_id, e.name AS name,
               f.feature_id, f.value
        FROM public.episode_features f
        JOIN public.episodes e ON e.id = f.entity_id
        WHERE f.feature_id = ANY(%s) AND f.value IS NOT NULL;
        """,
        (SMOKE_FEATURES,),
    )
    by_ep: dict[str, dict[str, Any]] = {}
    for row in cur.fetchall():
        rec = by_ep.setdefault(row["episode_id"], {"episode_id": row["episode_id"],
                                                    "name": row["name"], "features": {}})
        # Only non-null feature values land in the frame; missing ones are simply
        # absent (the trainer uses the features common to all episodes).
        if row["value"] is not None:
            rec["features"][row["feature_id"]] = float(row["value"])

    cur.execute(
        """
        SELECT entity_id::text AS episode_id, value
        FROM public.episode_targets WHERE target_name = %s AND value IS NOT NULL;
        """,
        (TARGET,),
    )
    targets = {r["episode_id"]: float(r["value"]) for r in cur.fetchall()}

    # Include every episode that has the target and at least one numeric feature;
    # train_smoke picks the features common (non-null) across the included episodes.
    frame: list[dict[str, Any]] = []
    for ep_id, rec in by_ep.items():
        if ep_id in targets and rec["features"]:
            rec[TARGET] = targets[ep_id]
            frame.append(rec)
    frame.sort(key=lambda r: r["name"])
    return frame


def _not_available(reason: str, n: int = 0) -> dict[str, Any]:
    return {"status": "not_available", "calibrated": False, "null_reason": reason,
            "n_train": n, "features": SMOKE_FEATURES, "importances": [], "episodes": []}


def train_smoke(frame: list[dict[str, Any]]) -> dict[str, Any]:
    """Fit the in-sample smoke classifier on a feature frame. Pure (no DB).

    Fails closed (returns a not_available envelope) when there are too few rows or
    fewer than two classes — never raises."""
    if len(frame) < 2:
        return _not_available("insufficient_episodes", len(frame))
    ys = [r[TARGET] for r in frame]
    if len(set(ys)) < 2:
        return _not_available("single_class", len(frame))

    # Use the features that are present (non-null) across EVERY included episode,
    # in the canonical order. Real data may leave a feature unavailable for some
    # episodes (e.g. no in-window credit history) — drop it rather than collapse.
    common = [f for f in SMOKE_FEATURES if all(f in r["features"] for r in frame)]
    if not common:
        return _not_available("no_common_features", len(frame))
    dropped = [f for f in SMOKE_FEATURES if f not in common]

    # Imported here so the pure import path / non-ML callers don't pull sklearn.
    from sklearn.ensemble import RandomForestClassifier

    X = [[r["features"][f] for f in common] for r in frame]
    clf = RandomForestClassifier(n_estimators=200, random_state=SEED)
    clf.fit(X, ys)
    pos_idx = list(clf.classes_).index(1.0) if 1.0 in clf.classes_ else len(clf.classes_) - 1
    probs = clf.predict_proba(X)
    importances = [
        {"feature": f, "importance": round(float(imp), 6)}
        for f, imp in sorted(zip(common, clf.feature_importances_),
                             key=lambda t: t[1], reverse=True)
    ]
    episodes = [
        {"episode_id": r["episode_id"], "name": r["name"],
         "recession_flag": r[TARGET],
         "recession_probability": round(float(probs[i][pos_idx]), 6)}
        for i, r in enumerate(frame)
    ]
    return {
        "status": "experimental",
        "status_label": "pipeline smoke model",
        "training_basis": f"{len(frame)} historical episodes",
        "purpose": "validate feature -> target -> train -> score flow",
        "calibrated": False,
        "model": "random_forest",
        "target": TARGET,
        "n_train": len(frame),
        "evaluation": "in_sample",
        "note": "Pipeline smoke model — proves the loop, NOT production-calibrated. "
                "Expand the episode/as_of population (Phase 1+) before trusting predictions.",
        "features": common,
        "features_dropped": dropped,
        "importances": importances,
        "episodes": episodes,
        "null_reason": None,
    }


def run_smoke_model(cur=None) -> dict[str, Any]:
    """Load the feature frame from the store and fit the smoke model. Fail-closed."""
    if cur is not None:
        return train_smoke(load_episode_frame(cur))
    with get_cursor() as c:
        return train_smoke(load_episode_frame(c))
