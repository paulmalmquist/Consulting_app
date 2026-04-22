"""Tests for post-extraction speaker dedup."""

from __future__ import annotations

import pytest

from app.services.podcast_speaker_merge import (
    _cluster_speakers,
    _is_generic_placeholder,
    _score,
)


@pytest.mark.parametrize(
    "name,expected",
    [
        ("speaker", True),
        ("speaker 1", True),
        ("speaker_1", True),
        ("unknown speaker", True),
        ("unknown speaker 2", True),
        ("unnamed speaker", True),
        ("unidentified speaker", True),
        ("anonymous speaker 3", True),
        ("michael howell", False),
        ("joe weisenthal", False),
        ("speaker of the house", False),  # not a placeholder
    ],
)
def test_is_generic_placeholder(name, expected):
    assert _is_generic_placeholder(name) is expected


def test_score_prefix_match():
    assert _score("michael", "michael howell") == 100.0
    assert _score("joe", "joe weisenthal") == 100.0
    # Prefix too short to count
    assert _score("jo", "joe weisenthal") < 100.0


def test_score_fuzzy():
    # token_set_ratio handles reorderings + partial matches
    assert _score("howell", "michael howell") >= 85.0
    assert _score("ozan tarman", "tarman ozan") >= 85.0
    # Completely different names — below the 85 merge threshold
    assert _score("michael howell", "joe weisenthal") < 85.0


def test_cluster_splits_placeholders_from_named():
    speakers = [
        {"speaker_id": "a", "name": "Michael", "normalized_name": "michael", "tenant_id": None},
        {"speaker_id": "b", "name": "Michael Howell", "normalized_name": "michael howell", "tenant_id": None},
        {"speaker_id": "c", "name": "Speaker 1", "normalized_name": "speaker 1", "tenant_id": None},
        {"speaker_id": "d", "name": "Unknown Speaker", "normalized_name": "unknown speaker", "tenant_id": None},
        {"speaker_id": "e", "name": "Joe Weisenthal", "normalized_name": "joe weisenthal", "tenant_id": None},
    ]
    clusters = _cluster_speakers(speakers)
    # Expect: [Michael+Michael Howell], [Joe Weisenthal], [Speaker 1 + Unknown Speaker]
    assert len(clusters) == 3
    # Placeholder cluster is last and contains both placeholders
    placeholder_cluster = clusters[-1]
    assert {s["name"] for s in placeholder_cluster} == {"Speaker 1", "Unknown Speaker"}
    # Michael + Michael Howell merge
    michael_cluster = next(c for c in clusters if any(s["name"] == "Michael Howell" for s in c))
    assert {s["name"] for s in michael_cluster} == {"Michael", "Michael Howell"}


def test_cluster_keeps_distinct_names_separate():
    speakers = [
        {"speaker_id": "a", "name": "Joe Weisenthal", "normalized_name": "joe weisenthal", "tenant_id": None},
        {"speaker_id": "b", "name": "Joe Biden", "normalized_name": "joe biden", "tenant_id": None},
    ]
    clusters = _cluster_speakers(speakers)
    assert len(clusters) == 2  # no placeholder cluster since all named


def test_cluster_empty_input():
    assert _cluster_speakers([]) == []
