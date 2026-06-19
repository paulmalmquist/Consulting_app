"""Unit tests for the ML Algorithm Decision Lab service (no DB).

Covers determinism, dataset shape, the 10-algorithm contract, per-family
sanity, and per-algorithm fail-closed behavior.
"""

from __future__ import annotations

import pytest

from app.services.hr_ml_demo import (
    ALGORITHM_DEMOS,
    build_compare,
    build_overview,
    generate_dataset,
    get_dataset_profile,
    run_algorithm,
    run_all_algorithms,
)
from app.services.hr_ml_demo.dataset import N_ROWS, NUMERIC_FEATURES

EXPECTED_IDS = {
    "linear_regression",
    "logistic_regression",
    "decision_tree",
    "random_forest",
    "svm",
    "knn",
    "naive_bayes",
    "kmeans",
    "hierarchical_clustering",
    "pca",
}

ENVELOPE_KEYS = {
    "algorithm_id",
    "name",
    "status",
    "null_reason",
    "task_type",
    "business_question",
    "dataset",
    "metrics",
    "charts",
    "model_card",
    "evidence",
    "external_links",
    "lineage",
}


def test_dataset_deterministic():
    a = generate_dataset(42)
    b = generate_dataset(42)
    assert a.equals(b)


def test_dataset_shape_and_targets():
    df = generate_dataset(42)
    assert len(df) == N_ROWS
    for col in NUMERIC_FEATURES:
        assert col in df.columns
        assert df[col].isna().sum() == 0
    assert {"forward_return_30d", "risk_event_30d", "theme", "narrative_text"} <= set(df.columns)
    # Binary target is imbalanced (the teaching point) but not degenerate.
    rate = df["risk_event_30d"].mean()
    assert 0.0 < rate < 0.4
    assert df["theme"].nunique() == 5


def test_profile_reports_balance():
    p = get_dataset_profile(42)
    assert p["n_rows"] == N_ROWS
    assert p["seed"] == 42
    assert p["source"] == "synthetic"
    assert p["class_balance"]["risk_event_30d"]["positive"] >= 1
    assert len(p["episodes"]) == 7


def test_run_all_returns_ten():
    algos = run_all_algorithms()["algorithms"]
    assert len(algos) == 10
    assert {a["algorithm_id"] for a in algos} == EXPECTED_IDS


@pytest.mark.parametrize("demo", ALGORITHM_DEMOS, ids=[d["id"] for d in ALGORITHM_DEMOS])
def test_each_algorithm_envelope(demo):
    res = run_algorithm(demo["id"])
    assert set(res.keys()) == ENVELOPE_KEYS
    assert res["status"] in {"ok", "not_available"}
    assert res["evidence"]["seed"] == 42
    assert res["evidence"]["model_version"] == "ml-demo-v1"
    # Static teaching content is always present.
    assert res["model_card"]["best_for"]
    assert res["model_card"]["fit_score_dimensions"]


def test_all_algorithms_ok_on_clean_data():
    algos = run_all_algorithms()["algorithms"]
    bad = [a["algorithm_id"] for a in algos if a["status"] != "ok"]
    assert bad == [], f"expected all ok on clean data, got not_available: {bad}"


def test_metrics_deterministic():
    a = run_algorithm("linear_regression")["metrics"]
    b = run_algorithm("linear_regression")["metrics"]
    assert a == b


def test_unknown_algorithm_is_not_available():
    res = run_algorithm("does_not_exist")
    assert res["status"] == "not_available"
    assert "unknown_algorithm" in res["null_reason"]


def test_per_algorithm_fail_closed(monkeypatch):
    # Make the regression trainer raise; the other nine must still be ok.
    import app.services.hr_ml_demo.runner as runner

    def boom(df, demo):
        raise RuntimeError("synthetic failure")

    patched = dict(runner.TRAINERS)
    patched["regression"] = boom
    monkeypatch.setattr(runner, "TRAINERS", patched)

    algos = run_all_algorithms()["algorithms"]
    by_id = {a["algorithm_id"]: a for a in algos}
    assert by_id["linear_regression"]["status"] == "not_available"
    assert by_id["linear_regression"]["null_reason"].startswith("training_failed")
    assert by_id["linear_regression"]["model_card"]["best_for"]  # card survived
    ok = [a for a in algos if a["status"] == "ok"]
    assert len(ok) == 9


def test_regression_metrics_present():
    m = run_algorithm("linear_regression")["metrics"]
    assert {"mae", "rmse", "r2"} <= set(m)


def test_classification_confusion_and_metrics():
    res = run_algorithm("random_forest")
    assert {"accuracy", "precision", "recall", "f1"} <= set(res["metrics"])
    cm = res["charts"]["confusion_matrix"]
    assert len(cm["matrix"]) == 2 and len(cm["matrix"][0]) == 2
    assert "false_negative" in cm["cells"]


def test_knn_neighbor_table():
    res = run_algorithm("knn")
    assert res["charts"]["neighbor_table"]
    assert "neighbors" in res["charts"]["neighbor_table"][0]


def test_text_top_tokens():
    res = run_algorithm("naive_bayes")
    assert res["task_type"] == "text_classification"
    assert res["charts"]["top_tokens"]
    assert {"f1_macro", "accuracy"} <= set(res["metrics"])


def test_kmeans_clustering():
    res = run_algorithm("kmeans")
    assert "silhouette" in res["metrics"]
    assert res["charts"]["pca_scatter"]
    assert res["charts"]["cluster_profiles"]


def test_hierarchical_dendrogram():
    res = run_algorithm("hierarchical_clustering")
    assert "children" in res["charts"]["dendrogram"]


def test_pca_explained_variance():
    res = run_algorithm("pca")
    evr = res["metrics"]["explained_variance_ratio"]
    assert isinstance(evr, list) and len(evr) >= 2
    assert res["charts"]["loadings"]


def test_compare_rows():
    cmp = build_compare()
    assert len(cmp["rows"]) == 10
    assert cmp["dimensions"]


def test_overview_shape():
    ov = build_overview()
    assert ov["hero_metrics"]["algorithms_total"] == 10
    assert ov["how_to_choose"]
    assert ov["demo_script"]["three_minute"]
    assert ov["cloud_provider"] in {"none", "gcp", "databricks"}
