"""Post-extraction speaker deduplication.

Phase 1's SpeakerResolver catches fuzzy matches within a single chunk's
extraction pass. It does NOT retroactively merge speakers when a later chunk
uses a longer name form than an earlier one, or when Claude and GPT-4o disagree
on surface form across passes.

Symptoms seen in live Phase 1 data:
  - "Michael" (short form from chunk 0) + "Michael Howell" (full name from chunk 3)
    ended up as two separate speaker rows with signals split between them.
  - Dozens of generic-placeholder surface forms like "Speaker 1", "Unknown Speaker 2",
    "Unnamed Speaker", "Speaker_1" landed as real speaker rows instead of
    routing to the per-episode unattributed fallback.

This module runs *after* extraction completes and merges within-episode
duplicates. Not a substitute for the resolver — a cleanup pass.

Usage:
    dedup_episode(episode_id) → MergeReport
    dedup_all_episodes() → list[MergeReport]
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from uuid import UUID

from rapidfuzz import fuzz

from app.db import get_cursor
from app.services.podcast_speaker_resolver import (
    SpeakerResolver,
    is_unattributed_form,
    normalize_name,
)

logger = logging.getLogger(__name__)

# Tables with a speaker_id FK to podcast_speakers.
_FK_TABLES = [
    "podcast_episode_speakers",
    "podcast_macro_views",
    "podcast_trade_ideas",
    "podcast_analogs",
    "podcast_uncertainty_markers",
    "speaker_predictions",
]

# Generic placeholder patterns that should all collapse to unattributed.
# These are variations that weren't in _UNATTRIBUTED_TOKENS at the time the
# signals were first written.
_GENERIC_PLACEHOLDER_RE = re.compile(
    r"^(unnamed|unknown|unidentified|anonymous)?\s*speaker(\s*[_\-]?\s*\d+)?$",
    re.IGNORECASE,
)

_FUZZY_THRESHOLD = 85.0
_PREFIX_MIN_LEN = 4


@dataclass
class MergeReport:
    episode_id: UUID
    merged_count: int = 0
    placeholders_routed: int = 0
    orphans_deleted: int = 0
    clusters: list[list[str]] = field(default_factory=list)


def _is_generic_placeholder(normalized: str) -> bool:
    return bool(_GENERIC_PLACEHOLDER_RE.match(normalized))


def _load_episode_speakers(episode_id: UUID) -> list[dict]:
    """Return all speakers linked to an episode (including those only referenced
    by signal tables, not the junction).
    """
    with get_cursor() as cur:
        cur.execute(
            """
            WITH speaker_refs AS (
                SELECT DISTINCT speaker_id FROM public.podcast_episode_speakers WHERE episode_id = %(eid)s
                UNION SELECT DISTINCT speaker_id FROM public.podcast_macro_views WHERE episode_id = %(eid)s AND speaker_id IS NOT NULL
                UNION SELECT DISTINCT speaker_id FROM public.podcast_trade_ideas WHERE episode_id = %(eid)s AND speaker_id IS NOT NULL
                UNION SELECT DISTINCT speaker_id FROM public.podcast_analogs WHERE episode_id = %(eid)s AND speaker_id IS NOT NULL
                UNION SELECT DISTINCT speaker_id FROM public.podcast_uncertainty_markers WHERE episode_id = %(eid)s AND speaker_id IS NOT NULL
            )
            SELECT s.speaker_id, s.name, s.normalized_name, s.tenant_id
            FROM public.podcast_speakers s
            JOIN speaker_refs r ON r.speaker_id = s.speaker_id
            """,
            {"eid": episode_id},
        )
        return cur.fetchall()


def _score(a: str, b: str) -> float:
    """Custom similarity: prefix match → 100, else token_set_ratio."""
    if not a or not b:
        return 0.0
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) >= _PREFIX_MIN_LEN and (longer == shorter or longer.startswith(shorter + " ")):
        return 100.0
    return float(fuzz.token_set_ratio(a, b))


def _cluster_speakers(speakers: list[dict]) -> list[list[dict]]:
    """Greedy cluster: named speakers grouped by fuzzy match, placeholders
    grouped separately so they can all route to unattributed.
    """
    named: list[dict] = []
    placeholders: list[dict] = []
    for s in speakers:
        norm = s["normalized_name"] or ""
        if norm.startswith("__unattributed_"):
            continue  # already unattributed, skip
        if _is_generic_placeholder(norm) or is_unattributed_form(s["name"]):
            placeholders.append(s)
        else:
            named.append(s)

    clusters: list[list[dict]] = []
    for s in named:
        placed = False
        for cluster in clusters:
            # Compare against the longest name in the cluster (canonical).
            canonical = max(cluster, key=lambda x: len(x["normalized_name"] or ""))
            score = _score(s["normalized_name"] or "", canonical["normalized_name"] or "")
            if score >= _FUZZY_THRESHOLD:
                cluster.append(s)
                placed = True
                break
        if not placed:
            clusters.append([s])

    if placeholders:
        clusters.append(placeholders)  # last cluster is placeholders → unattributed

    return clusters


def _canonical_speaker(cluster: list[dict]) -> dict:
    """Pick the most-canonical member: longest name wins."""
    return max(cluster, key=lambda s: len(s["name"] or ""))


def _reassign_fks(
    old_speaker_ids: list[UUID], new_speaker_id: UUID
) -> int:
    """Reassign every FK reference from old_speaker_ids to new_speaker_id.

    For podcast_episode_speakers (which has UNIQUE (episode_id, speaker_id)),
    we delete conflicting old rows before updating.
    """
    if not old_speaker_ids:
        return 0
    total = 0
    with get_cursor() as cur:
        # podcast_episode_speakers has UNIQUE (episode_id, speaker_id).
        # Strategy: capture distinct (episode_id, is_host) tuples from the old
        # rows, delete all old rows, then INSERT ON CONFLICT for the new.
        cur.execute(
            """
            SELECT DISTINCT episode_id, bool_or(is_host) AS is_host
            FROM public.podcast_episode_speakers
            WHERE speaker_id = ANY(%s)
            GROUP BY episode_id
            """,
            (old_speaker_ids,),
        )
        episode_rows = cur.fetchall()

        cur.execute(
            "DELETE FROM public.podcast_episode_speakers WHERE speaker_id = ANY(%s)",
            (old_speaker_ids,),
        )
        total += cur.rowcount

        for row in episode_rows:
            cur.execute(
                """
                INSERT INTO public.podcast_episode_speakers (episode_id, speaker_id, is_host)
                VALUES (%s, %s, %s)
                ON CONFLICT (episode_id, speaker_id) DO UPDATE
                    SET is_host = public.podcast_episode_speakers.is_host OR EXCLUDED.is_host
                """,
                (row["episode_id"], new_speaker_id, row["is_host"]),
            )

        for table in _FK_TABLES:
            if table == "podcast_episode_speakers":
                continue
            cur.execute(
                f"UPDATE public.{table} SET speaker_id = %s WHERE speaker_id = ANY(%s)",
                (new_speaker_id, old_speaker_ids),
            )
            total += cur.rowcount
    return total


def _delete_orphans(speaker_ids: list[UUID]) -> int:
    """Delete speaker rows that have zero FK references."""
    if not speaker_ids:
        return 0
    with get_cursor() as cur:
        cur.execute(
            """
            DELETE FROM public.podcast_speakers s
            WHERE s.speaker_id = ANY(%s)
              AND NOT EXISTS (SELECT 1 FROM public.podcast_episode_speakers WHERE speaker_id = s.speaker_id)
              AND NOT EXISTS (SELECT 1 FROM public.podcast_macro_views WHERE speaker_id = s.speaker_id)
              AND NOT EXISTS (SELECT 1 FROM public.podcast_trade_ideas WHERE speaker_id = s.speaker_id)
              AND NOT EXISTS (SELECT 1 FROM public.podcast_analogs WHERE speaker_id = s.speaker_id)
              AND NOT EXISTS (SELECT 1 FROM public.podcast_uncertainty_markers WHERE speaker_id = s.speaker_id)
              AND NOT EXISTS (SELECT 1 FROM public.speaker_predictions WHERE speaker_id = s.speaker_id)
            """,
            (speaker_ids,),
        )
        return cur.rowcount


def dedup_episode(episode_id: UUID) -> MergeReport:
    report = MergeReport(episode_id=episode_id)
    speakers = _load_episode_speakers(episode_id)
    if len(speakers) < 2:
        return report

    tenant_id = speakers[0]["tenant_id"]

    # Fold duplicate unattributed rows (different tenant_id but same episode key)
    # into the first one. This can happen when Phase 0 and Phase 1 used
    # different tenant_id values.
    unattributed_rows = [
        s for s in speakers
        if (s["normalized_name"] or "").startswith(f"__unattributed_{episode_id}")
    ]
    if len(unattributed_rows) > 1:
        canonical_unatt = unattributed_rows[0]
        dupe_ids = [s["speaker_id"] for s in unattributed_rows[1:]]
        moved = _reassign_fks(dupe_ids, canonical_unatt["speaker_id"])
        report.placeholders_routed += moved
        report.clusters.append(
            [f"[dup-unattributed] {s['speaker_id']}" for s in unattributed_rows[1:]]
            + [f"→ {canonical_unatt['speaker_id']}"]
        )
        # Reload speakers after the unattributed consolidation
        speakers = _load_episode_speakers(episode_id)

    clusters = _cluster_speakers(speakers)

    # Placeholder cluster → route all to unattributed for this episode
    resolver = SpeakerResolver(tenant_id=tenant_id, episode_id=episode_id)
    unattributed = resolver._unattributed_speaker()  # safe internal call

    for cluster in clusters:
        if not cluster:
            continue
        # Detect if this is the placeholder cluster
        is_placeholder_cluster = all(
            _is_generic_placeholder(s["normalized_name"] or "")
            or is_unattributed_form(s["name"])
            for s in cluster
        )
        if is_placeholder_cluster:
            old_ids = [s["speaker_id"] for s in cluster if s["speaker_id"] != unattributed.speaker_id]
            if old_ids:
                moved = _reassign_fks(old_ids, unattributed.speaker_id)
                report.placeholders_routed += moved
                report.clusters.append(
                    [f"[placeholder] {s['name']}" for s in cluster]
                    + [f"→ unattributed"]
                )
        else:
            if len(cluster) < 2:
                continue  # no merge needed
            canonical = _canonical_speaker(cluster)
            old_ids = [s["speaker_id"] for s in cluster if s["speaker_id"] != canonical["speaker_id"]]
            if old_ids:
                moved = _reassign_fks(old_ids, canonical["speaker_id"])
                report.merged_count += moved
                report.clusters.append(
                    [s["name"] for s in cluster] + [f"→ {canonical['name']}"]
                )

    # Clean up orphans created by the merge.
    all_old_ids = [s["speaker_id"] for s in speakers]
    report.orphans_deleted = _delete_orphans(all_old_ids)

    logger.info(
        "dedup_episode %s: merged=%d placeholders=%d orphans=%d clusters=%d",
        episode_id, report.merged_count, report.placeholders_routed,
        report.orphans_deleted, len(report.clusters),
    )
    return report


def dedup_all_episodes() -> list[MergeReport]:
    with get_cursor() as cur:
        cur.execute("SELECT episode_id FROM public.podcast_episodes ORDER BY created_at DESC")
        eids = [r["episode_id"] for r in cur.fetchall()]
    return [dedup_episode(eid) for eid in eids]


__all__ = ["MergeReport", "dedup_all_episodes", "dedup_episode"]
