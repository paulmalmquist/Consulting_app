"""Unit tests for the podcast speaker resolver.

Covers the K1/K3 fix: surface-form variants ("Ozan", "Tarman", "the guest")
must route to the correct speaker row without dropping signals. DB access is
mocked — these are pure logic tests.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.services.podcast_speaker_resolver import (
    SpeakerResolver,
    is_unattributed_form,
    normalize_name,
)


# ── Pure helpers ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Joe Weisenthal", "joe weisenthal"),
        ("  Dr. Ozan Tarman  ", "ozan tarman"),
        ("Mrs. Tracy Alloway", "tracy alloway"),
        ("Prof. Kenneth Rogoff", "kenneth rogoff"),
        ("Raoul, Pal.", "raoul pal"),
        ("", ""),
        (None, ""),
        ("Joe   Weisenthal", "joe weisenthal"),
    ],
)
def test_normalize_name(raw, expected):
    assert normalize_name(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("the guest", True),
        ("Our Guest Today", True),
        ("Unknown", True),
        ("", True),
        (None, True),
        ("Joe Weisenthal", False),
        ("Ozan", False),
    ],
)
def test_is_unattributed_form(raw, expected):
    assert is_unattributed_form(raw) is expected


# ── Resolver behavior (DB mocked) ─────────────────────────────────────────────


class _FakeCursor:
    """Minimal fake for psycopg cursor — returns a stable speaker_id per normalized_name."""

    def __init__(self, store: dict[str, dict]):
        self.store = store
        self._pending: dict | None = None

    def execute(self, sql, params):
        # INSERT ... ON CONFLICT ... RETURNING. Params: (tenant_id, name, normalized_name)
        _, name, normalized = params
        if normalized in self.store:
            self._pending = self.store[normalized]
        else:
            row = {
                "speaker_id": uuid.uuid4(),
                "name": name,
                "normalized_name": normalized,
            }
            self.store[normalized] = row
            self._pending = row

    def fetchone(self):
        return self._pending


@pytest.fixture
def fake_db():
    store: dict[str, dict] = {}

    @contextmanager
    def fake_get_cursor():
        yield _FakeCursor(store)

    with patch(
        "app.services.podcast_speaker_resolver.get_cursor",
        fake_get_cursor,
    ):
        yield store


def _make_resolver() -> SpeakerResolver:
    return SpeakerResolver(tenant_id=None, episode_id=uuid.uuid4())


def test_exact_match_returns_same_speaker(fake_db):
    r = _make_resolver()
    a = r.resolve("Joe Weisenthal")
    b = r.resolve("Joe Weisenthal")
    assert a.speaker_id == b.speaker_id


def test_normalized_match_ignores_case_and_title(fake_db):
    r = _make_resolver()
    a = r.resolve("Dr. Ozan Tarman")
    b = r.resolve("ozan tarman")
    assert a.speaker_id == b.speaker_id


def test_prefix_match_short_form_to_full_name(fake_db):
    """K1 fix: 'Joe' should match existing 'Joe Weisenthal'."""
    r = _make_resolver()
    full = r.resolve("Joe Weisenthal")
    short = r.resolve("Joe")
    assert full.speaker_id == short.speaker_id


def test_fuzzy_match_last_name_only(fake_db):
    """K1 fix: 'Tarman' should match existing 'Ozan Tarman' via rapidfuzz."""
    r = _make_resolver()
    full = r.resolve("Ozan Tarman")
    last = r.resolve("Tarman")
    assert full.speaker_id == last.speaker_id


def test_unattributed_fallback(fake_db):
    """K1 fix: 'the guest' must not return None — falls back to per-episode unattributed."""
    r = _make_resolver()
    result = r.resolve("the guest")
    assert result.is_unattributed
    assert result.speaker_id is not None


def test_unattributed_is_stable_within_episode(fake_db):
    r = _make_resolver()
    a = r.resolve("the guest")
    b = r.resolve("our guest today")
    c = r.resolve("")
    assert a.speaker_id == b.speaker_id == c.speaker_id


def test_unattributed_differs_across_episodes(fake_db):
    r1 = SpeakerResolver(tenant_id=None, episode_id=uuid.uuid4())
    r2 = SpeakerResolver(tenant_id=None, episode_id=uuid.uuid4())
    assert r1.resolve("the guest").speaker_id != r2.resolve("the guest").speaker_id


def test_preload_registers_speakers_for_fuzzy_lookup(fake_db):
    r = _make_resolver()
    r.preload_episode_speakers(["Joe Weisenthal", "Tracy Alloway", "Ozan Tarman"])

    # Later fuzzy lookups hit the preloaded set instead of creating duplicates.
    joe = r.resolve("Joe")
    ozan = r.resolve("Tarman")
    tracy = r.resolve("tracy")

    # Only 3 real speaker rows exist (preloaded) — no duplicates from fuzzy hits.
    real_rows = [
        k for k in fake_db.keys() if not k.startswith("__unattributed_")
    ]
    assert len(real_rows) == 3
    assert joe.canonical_name == "Joe Weisenthal"
    assert ozan.canonical_name == "Ozan Tarman"
    assert tracy.canonical_name == "Tracy Alloway"


def test_distinct_speakers_stay_distinct(fake_db):
    """Don't over-merge: Joe Weisenthal and Joe Biden must remain different speakers."""
    r = _make_resolver()
    a = r.resolve("Joe Weisenthal")
    b = r.resolve("Joe Biden")
    assert a.speaker_id != b.speaker_id


def test_surface_cache_short_circuits_repeat_lookups(fake_db):
    r = _make_resolver()
    a = r.resolve("the guest")
    b = r.resolve("the guest")
    assert a is b  # same object from surface cache
