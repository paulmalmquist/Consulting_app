"""Speaker resolution for podcast extraction pipeline.

Problem: GPT-4o and Claude refer to the same speaker by different surface forms
within a single episode — "Ozan Tarman" / "Ozan" / "Tarman" / "the guest" / "our
guest today". Naive equality lookup drops 80%+ of signals. This resolver maps
any surface form to a canonical ``podcast_speakers`` row via a fallback chain,
creating rows as needed and falling back to a per-episode "unattributed"
speaker rather than returning None.

Match chain: exact → normalized → prefix (≥4 chars) → rapidfuzz ratio ≥ 80.
Cache scope: per SpeakerResolver instance (typically one per episode extraction
run). Cross-episode dedup happens at persistence time via the unique index on
``(tenant_id, normalized_name)``.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from rapidfuzz import fuzz

from app.db import get_cursor

_TITLE_PREFIX_RE = re.compile(
    r"^(mr|mrs|ms|miss|dr|prof|professor|sir|dame)\.?\s+",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")

# Surface forms that indicate an unnamed speaker — route to unattributed fallback.
_UNATTRIBUTED_TOKENS = frozenset(
    {
        "the guest",
        "our guest",
        "our guest today",
        "guest",
        "the host",
        "the speaker",
        "speaker",
        "speaker unidentified",
        "unidentified speaker",
        "unidentified",
        "unknown",
        "unnamed",
        "unattributed",
        "n a",
        "none",
        "",
    }
)

_FUZZY_THRESHOLD = 80.0
_PREFIX_MIN_LEN = 4


def normalize_name(raw: str | None) -> str:
    """Lowercase, strip titles, drop punctuation, collapse whitespace.

    Returns empty string for None/blank input. Callers should treat empty
    output as "unattributed".
    """
    if not raw:
        return ""
    s = raw.strip().lower()
    s = _TITLE_PREFIX_RE.sub("", s)
    s = _PUNCT_RE.sub(" ", s)
    s = _WHITESPACE_RE.sub(" ", s).strip()
    return s


def is_unattributed_form(raw: str | None) -> bool:
    return normalize_name(raw) in _UNATTRIBUTED_TOKENS


@dataclass
class ResolvedSpeaker:
    speaker_id: UUID
    canonical_name: str
    normalized_name: str
    is_unattributed: bool = False


@dataclass
class SpeakerResolver:
    """Per-episode speaker resolver.

    Typical usage:
        resolver = SpeakerResolver(tenant_id=..., episode_id=...)
        resolver.preload_episode_speakers(["Joe Weisenthal", "Tracy Alloway"])
        sid = resolver.resolve("Joe").speaker_id  # matches Joe Weisenthal
        sid = resolver.resolve("the guest").speaker_id  # unattributed fallback
    """

    tenant_id: UUID | None
    episode_id: UUID
    # normalized_name -> ResolvedSpeaker
    _cache: dict[str, ResolvedSpeaker] = field(default_factory=dict)
    # raw surface form -> ResolvedSpeaker (short-circuits repeat lookups)
    _surface_cache: dict[str, ResolvedSpeaker] = field(default_factory=dict)
    _unattributed: ResolvedSpeaker | None = None

    def preload_episode_speakers(self, names: list[str]) -> list[ResolvedSpeaker]:
        """Register the speakers identified by the first extraction pass.

        Creates rows if they don't exist. Later fuzzy lookups prefer these
        registered names over creating new speakers, which prevents "Ozan" from
        spawning a second row when "Ozan Tarman" is already registered.
        """
        resolved: list[ResolvedSpeaker] = []
        for name in names:
            if is_unattributed_form(name):
                continue
            resolved.append(self._get_or_create(name))
        return resolved

    def resolve(self, surface_form: str | None) -> ResolvedSpeaker:
        """Map any surface form to a speaker, falling back to unattributed."""
        if surface_form in self._surface_cache:
            return self._surface_cache[surface_form]

        if is_unattributed_form(surface_form):
            result = self._unattributed_speaker()
        else:
            normalized = normalize_name(surface_form)
            if not normalized:
                result = self._unattributed_speaker()
            elif normalized in self._cache:
                result = self._cache[normalized]
            else:
                fuzzy_hit = self._fuzzy_match_cache(normalized)
                if fuzzy_hit is not None:
                    result = fuzzy_hit
                else:
                    result = self._get_or_create(surface_form or "", normalized)

        if surface_form is not None:
            self._surface_cache[surface_form] = result
        return result

    def _fuzzy_match_cache(self, normalized: str) -> ResolvedSpeaker | None:
        """Try prefix and rapidfuzz match against already-cached speakers.

        Prefix match: one normalized name is a prefix of the other and the
        shorter is at least _PREFIX_MIN_LEN chars. Catches "Ozan" → "Ozan Tarman".

        Fuzzy match: rapidfuzz token_set_ratio ≥ _FUZZY_THRESHOLD. Catches
        "Tarman" → "Ozan Tarman" (last-name-only reference).
        """
        best: tuple[float, ResolvedSpeaker] | None = None
        for cached_norm, cached in self._cache.items():
            if _is_prefix_match(normalized, cached_norm):
                return cached
            score = fuzz.token_set_ratio(normalized, cached_norm)
            if score >= _FUZZY_THRESHOLD and (best is None or score > best[0]):
                best = (score, cached)
        return best[1] if best else None

    def _get_or_create(
        self, raw_name: str, normalized: str | None = None
    ) -> ResolvedSpeaker:
        normalized = normalized or normalize_name(raw_name)
        if not normalized:
            return self._unattributed_speaker()

        if normalized in self._cache:
            return self._cache[normalized]

        canonical = raw_name.strip() or normalized
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.podcast_speakers (tenant_id, name, normalized_name)
                VALUES (%s, %s, %s)
                ON CONFLICT (tenant_id, normalized_name) DO UPDATE
                    SET updated_at = now()
                RETURNING speaker_id, name, normalized_name
                """,
                (self.tenant_id, canonical, normalized),
            )
            row = cur.fetchone()

        resolved = ResolvedSpeaker(
            speaker_id=row["speaker_id"],
            canonical_name=row["name"],
            normalized_name=row["normalized_name"],
        )
        self._cache[normalized] = resolved
        return resolved

    def _unattributed_speaker(self) -> ResolvedSpeaker:
        if self._unattributed is not None:
            return self._unattributed

        # One unattributed speaker per episode — embed episode_id in normalized
        # form so it's unique across episodes. We don't want a single shared
        # unattributed row because then signals from different episodes would
        # aggregate under "nobody in particular".
        normalized = f"__unattributed_{self.episode_id}"
        canonical = "Unattributed"
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.podcast_speakers (tenant_id, name, normalized_name)
                VALUES (%s, %s, %s)
                ON CONFLICT (tenant_id, normalized_name) DO UPDATE
                    SET updated_at = now()
                RETURNING speaker_id, name, normalized_name
                """,
                (self.tenant_id, canonical, normalized),
            )
            row = cur.fetchone()

        self._unattributed = ResolvedSpeaker(
            speaker_id=row["speaker_id"],
            canonical_name=row["name"],
            normalized_name=row["normalized_name"],
            is_unattributed=True,
        )
        return self._unattributed


def _is_prefix_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) < _PREFIX_MIN_LEN:
        return False
    # Match on whole-word prefix so "Joe" matches "Joe Weisenthal" but not "Joey".
    return longer == shorter or longer.startswith(shorter + " ")


__all__ = [
    "ResolvedSpeaker",
    "SpeakerResolver",
    "is_unattributed_form",
    "normalize_name",
]
