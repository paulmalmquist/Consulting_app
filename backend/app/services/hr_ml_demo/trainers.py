"""Train/eval one algorithm per task family on the synthetic dataset.

Each trainer takes the dataset (a possibly-mutated copy, for Reality Mode) and a
registry entry, and returns `{dataset, metrics, charts}` with plain Python types
(no numpy scalars) so the route serializes cleanly. Determinism: fixed seed on
every split and estimator, fixed feature order.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    roc_curve,
    silhouette_score,
)
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from .dataset import NUMERIC_FEATURES
from .schema import SEED

_TEST_SIZE = 0.25


def _f(x: Any) -> float:
    return float(x)


def _i(x: Any) -> int:
    return int(x)


def _split_mode(scenario: dict[str, Any] | None) -> str:
    return (scenario or {}).get("split_mode", "random")


def _group_key(df: pd.DataFrame) -> np.ndarray:
    if "__group__" in df.columns:
        return df["__group__"].to_numpy()
    return df["observation_id"].to_numpy()


def _split_supervised(
    df: pd.DataFrame, X: np.ndarray, y: np.ndarray, scenario: dict[str, Any] | None, stratify=None
):
    """Train/test split honoring scenario split_mode (random|time|episode_grouped)."""
    mode = _split_mode(scenario)
    if mode == "time":
        order = np.argsort(df["as_of_date"].to_numpy(), kind="stable")
        cut = max(1, int(len(df) * (1 - _TEST_SIZE)))
        tr, te = order[:cut], order[cut:]
        return X[tr], X[te], y[tr], y[te]
    if mode in ("episode_grouped", "grouped"):
        gss = GroupShuffleSplit(n_splits=1, test_size=_TEST_SIZE, random_state=SEED)
        tr, te = next(gss.split(X, y, groups=_group_key(df)))
        return X[tr], X[te], y[tr], y[te]
    return train_test_split(
        X, y, test_size=_TEST_SIZE, random_state=SEED, shuffle=True, stratify=stratify
    )


def _leakage_features(df: pd.DataFrame, features: list[str], scenario: dict[str, Any] | None) -> list[str]:
    """Append the injected leaked feature when the data_leakage toggle is active."""
    toggles = set((scenario or {}).get("toggles", []) or [])
    if "data_leakage" in toggles and "__leaked__" in df.columns:
        return features + ["__leaked__"]
    return features


def _dataset_block(features: list[str], target: str | None, n_train: int, n_test: int, n_rows: int) -> dict[str, Any]:
    return {
        "n_rows": _i(n_rows),
        "n_features": len(features),
        "train_rows": _i(n_train),
        "test_rows": _i(n_test),
        "target": target,
        "features": list(features),
    }


# ── Regression ──────────────────────────────────────────────────────────────


def train_regression(df: pd.DataFrame, demo: dict[str, Any], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    features = _leakage_features(df, list(demo["features"]), scenario)
    target = demo["target"]
    X = df[features].to_numpy(dtype=float)
    y = df[target].to_numpy(dtype=float)
    X_tr, X_te, y_tr, y_te = _split_supervised(df, X, y, scenario)
    scaler = StandardScaler().fit(X_tr)
    model = LinearRegression().fit(scaler.transform(X_tr), y_tr)
    pred = model.predict(scaler.transform(X_te))

    rmse = float(np.sqrt(np.mean((y_te - pred) ** 2)))
    metrics = {
        "mae": _f(mean_absolute_error(y_te, pred)),
        "rmse": rmse,
        "r2": _f(r2_score(y_te, pred)),
    }
    avp = [
        {"actual": _f(a), "predicted": _f(p), "residual": _f(a - p)}
        for a, p in zip(y_te.tolist(), pred.tolist())
    ]
    coeffs = [
        {"feature": f, "coefficient": _f(c)}
        for f, c in zip(features, model.coef_.tolist())
    ]
    coeffs.sort(key=lambda d: abs(d["coefficient"]), reverse=True)
    return {
        "dataset": _dataset_block(features, target, len(y_tr), len(y_te), len(df)),
        "metrics": metrics,
        "charts": {"actual_vs_predicted": avp, "coefficient_bar": coeffs},
    }


# ── Binary classification ────────────────────────────────────────────────────


def _make_classifier(algorithm_id: str):
    if algorithm_id == "logistic_regression":
        return LogisticRegression(max_iter=1000, random_state=SEED), True
    if algorithm_id == "decision_tree":
        return DecisionTreeClassifier(max_depth=4, random_state=SEED), False
    if algorithm_id == "random_forest":
        return RandomForestClassifier(n_estimators=50, random_state=SEED), False
    if algorithm_id == "svm":
        return SVC(probability=True, random_state=SEED), True
    if algorithm_id == "knn":
        return KNeighborsClassifier(n_neighbors=7), True
    raise ValueError(f"no classifier for {algorithm_id}")


def _confusion_block(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = (int(cm[0][0]), int(cm[0][1]), int(cm[1][0]), int(cm[1][1]))
    return {
        "labels": ["no_risk", "risk_event"],
        "matrix": [[tn, fp], [fn, tp]],
        "cells": {
            "true_negative": tn,
            "false_positive": fp,
            "false_negative": fn,
            "true_positive": tp,
        },
        "false_negative_note": "Business risk: missed risk event",
    }


def _roc_block(y_true: np.ndarray, proba: np.ndarray) -> list[dict[str, float]]:
    fpr, tpr, _ = roc_curve(y_true, proba)
    # Down-sample to <=25 points for a light payload, keeping endpoints.
    n = len(fpr)
    if n <= 25:
        idx = range(n)
    else:
        idx = sorted(set(np.linspace(0, n - 1, 25).astype(int).tolist()))
    return [{"fpr": _f(fpr[k]), "tpr": _f(tpr[k])} for k in idx]


def train_classification(df: pd.DataFrame, demo: dict[str, Any], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    aid = demo["id"]
    features = _leakage_features(df, list(demo["features"]), scenario)
    target = demo["target"]
    X = df[features].to_numpy(dtype=float)
    y = df[target].to_numpy(dtype=int)
    # Stratify only for the random split; time/grouped splits choose by order/group.
    stratify = y if _split_mode(scenario) == "random" else None
    X_tr, X_te, y_tr, y_te = _split_supervised(df, X, y, scenario, stratify=stratify)
    model, needs_scaling = _make_classifier(aid)
    if needs_scaling:
        scaler = StandardScaler().fit(X_tr)
        X_tr_s, X_te_s = scaler.transform(X_tr), scaler.transform(X_te)
    else:
        X_tr_s, X_te_s = X_tr, X_te
    model.fit(X_tr_s, y_tr)
    pred = model.predict(X_te_s)
    proba = model.predict_proba(X_te_s)[:, 1]

    metrics = {
        "accuracy": _f(np.mean(pred == y_te)),
        "precision": _f(precision_score(y_te, pred, zero_division=0)),
        "recall": _f(recall_score(y_te, pred, zero_division=0)),
        "f1": _f(f1_score(y_te, pred, zero_division=0)),
        "roc_auc": _f(roc_auc_score(y_te, proba)) if len(set(y_te.tolist())) > 1 else None,
    }
    charts: dict[str, Any] = {
        "confusion_matrix": _confusion_block(y_te, pred),
        "roc_curve": _roc_block(y_te, proba),
    }

    # Feature importance: tree importances or |coef|; otherwise omit with note.
    importance = _feature_importance(model, features)
    if importance is not None:
        charts["feature_importance"] = importance
    else:
        charts["feature_importance_note"] = "Feature importance is not defined for this model."

    if aid == "knn":
        charts["neighbor_table"] = _neighbor_table(model, X_tr_s, y_tr, X_te_s, y_te, features, X_te)

    return {
        "dataset": _dataset_block(features, target, len(y_tr), len(y_te), len(df)),
        "metrics": metrics,
        "charts": charts,
    }


def _feature_importance(model: Any, features: list[str]) -> list[dict[str, Any]] | None:
    if hasattr(model, "feature_importances_"):
        vals = model.feature_importances_.tolist()
    elif hasattr(model, "coef_"):
        coef = np.ravel(model.coef_)
        vals = np.abs(coef).tolist()
    else:
        return None
    out = [{"feature": f, "importance": _f(v)} for f, v in zip(features, vals)]
    out.sort(key=lambda d: d["importance"], reverse=True)
    return out


def _neighbor_table(
    model: Any,
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    X_te: np.ndarray,
    y_te: np.ndarray,
    features: list[str],
    X_te_raw: np.ndarray,
    n_samples: int = 5,
) -> list[dict[str, Any]]:
    k = min(5, X_tr.shape[0])
    rows: list[dict[str, Any]] = []
    n = min(n_samples, X_te.shape[0])
    dist, idx = model.kneighbors(X_te[:n], n_neighbors=k)
    for i in range(n):
        neighbors = []
        for d, j in zip(dist[i].tolist(), idx[i].tolist()):
            neighbors.append({"distance": _f(d), "label": _i(y_tr[j])})
        rows.append(
            {
                "test_index": i,
                "true_label": _i(y_te[i]),
                "neighbor_vote_positive": _i(sum(nb["label"] for nb in neighbors)),
                "k": k,
                "neighbors": neighbors,
            }
        )
    return rows


# ── Text classification ───────────────────────────────────────────────────────


def train_text(df: pd.DataFrame, demo: dict[str, Any], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    target = demo["target"]
    texts = df["narrative_text"].astype(str).tolist()
    labels = df[target].astype(str).to_numpy()
    idx = np.arange(len(texts))
    tr_idx, te_idx = train_test_split(
        idx, test_size=_TEST_SIZE, random_state=SEED, shuffle=True, stratify=labels
    )
    vec = CountVectorizer(token_pattern=r"(?u)\b[a-z]{2,}\b", min_df=1)
    X_tr = vec.fit_transform([texts[i] for i in tr_idx])
    X_te = vec.transform([texts[i] for i in te_idx])
    y_tr, y_te = labels[tr_idx], labels[te_idx]
    model = MultinomialNB().fit(X_tr, y_tr)
    pred = model.predict(X_te)

    classes = model.classes_.tolist()
    metrics = {
        "accuracy": _f(np.mean(pred == y_te)),
        "f1_macro": _f(f1_score(y_te, pred, average="macro", zero_division=0)),
    }
    # Top tokens per theme by log-probability.
    vocab = np.array(vec.get_feature_names_out())
    top_tokens = []
    for ci, cls in enumerate(classes):
        order = np.argsort(model.feature_log_prob_[ci])[::-1][:6]
        top_tokens.append({"theme": cls, "tokens": vocab[order].tolist()})
    cm = confusion_matrix(y_te, pred, labels=classes).tolist()
    return {
        "dataset": _dataset_block(["narrative_text"], target, len(tr_idx), len(te_idx), len(df)),
        "metrics": metrics,
        "charts": {
            "top_tokens": top_tokens,
            "confusion_matrix": {"labels": classes, "matrix": [[int(c) for c in row] for row in cm]},
        },
    }


# ── Clustering ────────────────────────────────────────────────────────────────


def _cluster_profiles(df: pd.DataFrame, labels: np.ndarray) -> list[dict[str, Any]]:
    profiles = []
    for c in sorted(set(labels.tolist())):
        mask = labels == c
        sub = df.loc[mask]
        means = {f: _f(sub[f].astype(float).mean()) for f in NUMERIC_FEATURES}
        dominant_regime = sub["regime_label"].mode().iloc[0] if len(sub) else None
        profiles.append(
            {
                "cluster": _i(c),
                "size": _i(int(mask.sum())),
                "dominant_regime": dominant_regime,
                "risk_event_rate": _f(sub["risk_event_30d"].astype(float).mean()) if len(sub) else None,
                "feature_means": means,
            }
        )
    return profiles


def _pca_scatter(coords: np.ndarray, color_values: list[Any], color_key: str) -> list[dict[str, Any]]:
    return [
        {"pc1": _f(coords[i, 0]), "pc2": _f(coords[i, 1]), color_key: color_values[i]}
        for i in range(coords.shape[0])
    ]


def train_clustering(df: pd.DataFrame, demo: dict[str, Any], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    aid = demo["id"]
    X = df[NUMERIC_FEATURES].to_numpy(dtype=float)
    Xs = StandardScaler().fit_transform(X)
    coords = PCA(n_components=2, random_state=SEED).fit_transform(Xs)

    if aid == "kmeans":
        model = KMeans(n_clusters=4, n_init=10, random_state=SEED)
        labels = model.fit_predict(Xs)
        metrics = {
            "silhouette": _f(silhouette_score(Xs, labels)),
            "inertia": _f(model.inertia_),
        }
        charts_extra: dict[str, Any] = {}
    else:  # hierarchical_clustering
        model = AgglomerativeClustering(n_clusters=4)
        labels = model.fit_predict(Xs)
        metrics = {"silhouette": _f(silhouette_score(Xs, labels))}
        charts_extra = {"dendrogram": _dendrogram(Xs)}

    charts = {
        "pca_scatter": _pca_scatter(coords, [int(c) for c in labels.tolist()], "cluster"),
        "cluster_profiles": _cluster_profiles(df, labels),
        **charts_extra,
    }
    return {
        "dataset": _dataset_block(NUMERIC_FEATURES, None, len(df), 0, len(df)),
        "metrics": metrics,
        "charts": charts,
    }


def _dendrogram(Xs: np.ndarray, max_depth: int = 4) -> dict[str, Any]:
    """Serialized, depth-capped Ward linkage tree for a simplified SVG render."""
    from scipy.cluster.hierarchy import linkage, to_tree

    Z = linkage(Xs, method="ward")
    root, _ = to_tree(Z, rd=True)

    def serialize(node: Any, depth: int) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": _i(node.id),
            "height": _f(node.dist),
            "count": _i(node.count),
        }
        if not node.is_leaf() and depth < max_depth:
            out["children"] = [
                serialize(node.left, depth + 1),
                serialize(node.right, depth + 1),
            ]
        return out

    return serialize(root, 0)


# ── Dimensionality reduction ──────────────────────────────────────────────────


def train_dim_reduction(df: pd.DataFrame, demo: dict[str, Any], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    X = df[NUMERIC_FEATURES].to_numpy(dtype=float)
    Xs = StandardScaler().fit_transform(X)
    n_comp = min(5, len(NUMERIC_FEATURES))
    pca = PCA(n_components=n_comp, random_state=SEED).fit(Xs)
    coords = pca.transform(Xs)[:, :2]

    evr = pca.explained_variance_ratio_.tolist()
    cum = np.cumsum(evr).tolist()
    metrics = {
        "explained_variance_ratio": [_f(v) for v in evr],
        "cumulative_explained_variance": [_f(v) for v in cum],
    }
    evr_bar = [
        {"component": f"PC{k + 1}", "ratio": _f(evr[k]), "cumulative": _f(cum[k])}
        for k in range(n_comp)
    ]
    loadings = [
        {"feature": f, "pc1": _f(pca.components_[0][i]), "pc2": _f(pca.components_[1][i])}
        for i, f in enumerate(NUMERIC_FEATURES)
    ]
    scatter = _pca_scatter(coords, df["regime_label"].tolist(), "regime_label")
    return {
        "dataset": _dataset_block(NUMERIC_FEATURES, None, len(df), 0, len(df)),
        "metrics": metrics,
        "charts": {
            "explained_variance_bar": evr_bar,
            "pca_scatter": scatter,
            "loadings": loadings,
        },
    }


TRAINERS = {
    "regression": train_regression,
    "classification": train_classification,
    "text": train_text,
    "clustering": train_clustering,
    "dim_reduction": train_dim_reduction,
}
