"""Tests for narrative clustering + velocity math."""

from __future__ import annotations

import pytest

from app.services.podcast_narrative_velocity import (
    _cluster_embeddings,
    _cosine,
    _crowding_risk,
)


def test_cosine_identical_vectors():
    assert _cosine([1.0, 0.0, 0.0], [1.0, 0.0, 0.0]) == pytest.approx(1.0)


def test_cosine_orthogonal():
    assert _cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_zero_vector():
    assert _cosine([0.0, 0.0], [1.0, 1.0]) == 0.0


def test_cluster_single_linkage_merges_similar():
    # Three labels; A and B are very similar, C is different.
    a = [1.0, 0.0, 0.0]
    b = [0.95, 0.3, 0.0]  # cos(a,b) ≈ 0.953
    c = [0.0, 0.0, 1.0]
    embeddings = {"A": a, "B": b, "C": c}
    clusters = _cluster_embeddings(embeddings, threshold=0.8)
    assert len(clusters) == 2
    merged = next(c for c in clusters if len(c) == 2)
    singleton = next(c for c in clusters if len(c) == 1)
    assert set(merged) == {"A", "B"}
    assert singleton == ["C"]


def test_cluster_no_merges_below_threshold():
    embeddings = {
        "x": [1.0, 0.0, 0.0],
        "y": [0.0, 1.0, 0.0],
        "z": [0.0, 0.0, 1.0],
    }
    clusters = _cluster_embeddings(embeddings, threshold=0.8)
    assert len(clusters) == 3


@pytest.mark.parametrize(
    "mentions,speakers,conv,expected",
    [
        (1, 1, 50.0, "low"),
        (2, 1, 50.0, "low"),
        (5, 3, 60.0, "moderate"),
        (10, 5, 75.0, "elevated"),
        (20, 6, 80.0, "high"),
        (25, 8, 85.0, "high"),  # high bucket (extreme requires ≥80 conv AND ≥5 speakers AND >15 mentions — matches)
    ],
)
def test_crowding_risk_buckets(mentions, speakers, conv, expected):
    assert _crowding_risk(mentions, speakers, conv) == expected
