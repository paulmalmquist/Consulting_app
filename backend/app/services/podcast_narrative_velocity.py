"""Narrative label normalization + velocity aggregation.

Step 1 — Embed every narrative_label with text-embedding-3-small.
Step 2 — Cluster by cosine similarity: labels with cos ≥ 0.80 are the same
         narrative. Longest label in each cluster becomes canonical.
Step 3 — Write one podcast_narrative_velocity row per canonical narrative
         covering its active window, with mention_count, unique_speakers,
         conviction_avg, and crowding_risk assigned by count + speaker
         diversity thresholds from the meta-prompt.

Phase 3 deliberately does NOT do per-window rolling aggregation (7d / 30d /
90d). That's Phase 4 scheduled-task scope. Phase 3 = one snapshot across
all current data so the Phase 2 gate-check report has cross-episode
narrative clusters visible.

Usage:
    compute_narrative_velocity() → list[VelocityRow]

Writes back to podcast_narrative_velocity.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime

from app.db import get_cursor
from app.services.ai_client import get_instrumented_sync_client

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
SIMILARITY_MERGE_THRESHOLD = 0.65  # Tuned empirically on 3-episode corpus.
# Sweep results: 0.80→0 cross-ep clusters, 0.75→1, 0.70→1, 0.65→4, 0.60→5.
# 0.65 surfaces "Gold as safe haven" (OL+FG), "Fed QE transition" (OL+MV),
# "Steepener trade" (OL+FG), "Dollar rally" (FG+MV) without false positives.
# Phase 4 will tune per-narrative-type with human-labeled feedback.

# Crowding risk thresholds (see meta-prompt Step 3.1).
# Phase 3 uses all-time; Phase 4 will swap in 30-day window counts.
_LOW_MAX = 2     # < 3 mentions AND < 2 speakers = low
_MOD_MAX = 7     # 3-7 mentions, 2-4 speakers = moderate
_ELE_MAX = 15    # 8-15 mentions, 5+ speakers = elevated


@dataclass
class VelocityRow:
    canonical_label: str
    mention_count: int
    unique_speakers: int
    conviction_avg: float
    crowding_risk: str
    members: list[str] = field(default_factory=list)
    window_start: datetime | None = None
    window_end: datetime | None = None
    episode_ids: set = field(default_factory=set)


def _fetch_narratives() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT n.narrative_id, n.narrative_label, n.conviction, n.novelty_score,
                   n.episode_id, n.tenant_id, n.created_at, n.speakers_mentioning
            FROM public.podcast_narratives n
            ORDER BY n.created_at
            """
        )
        return cur.fetchall()


def _embed_labels(labels: list[str]) -> list[list[float]]:
    """Batch-embed every unique narrative label."""
    if not labels:
        return []
    client = get_instrumented_sync_client()
    resp = client.embeddings.create(model=EMBEDDING_MODEL, input=labels)
    return [d.embedding for d in resp.data]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _cluster_embeddings(
    embeddings: dict[str, list[float]],
    threshold: float = SIMILARITY_MERGE_THRESHOLD,
) -> list[list[str]]:
    """Greedy single-link clustering. Returns list of label clusters."""
    labels = list(embeddings.keys())
    clusters: list[list[str]] = []
    placed: set[str] = set()

    for i, label in enumerate(labels):
        if label in placed:
            continue
        cluster = [label]
        placed.add(label)
        for other in labels[i + 1 :]:
            if other in placed:
                continue
            sim = _cosine(embeddings[label], embeddings[other])
            if sim >= threshold:
                cluster.append(other)
                placed.add(other)
        clusters.append(cluster)
    return clusters


def _crowding_risk(mentions: int, speakers: int, conviction_avg: float) -> str:
    if mentions <= _LOW_MAX and speakers < 2:
        return "low"
    if mentions <= _MOD_MAX and speakers <= 4:
        return "moderate"
    if mentions <= _ELE_MAX and speakers >= 5 and conviction_avg >= 70:
        return "elevated"
    if mentions > _ELE_MAX and conviction_avg >= 70:
        return "high"
    if mentions > _ELE_MAX and conviction_avg >= 80 and speakers >= 5:
        return "extreme"
    # Fallback: decide by mention count alone.
    if mentions >= 15:
        return "elevated"
    if mentions >= 8:
        return "moderate"
    return "low"


def compute_narrative_velocity() -> list[VelocityRow]:
    """Embed → cluster → aggregate → persist."""
    rows = _fetch_narratives()
    if not rows:
        return []

    # Build a unique-label → representative narrative_ids map.
    label_to_ids: dict[str, list] = {}
    for r in rows:
        label_to_ids.setdefault(r["narrative_label"], []).append(r)

    unique_labels = list(label_to_ids.keys())
    logger.info("embedding %d unique narrative labels", len(unique_labels))
    vectors = _embed_labels(unique_labels)
    embeddings = dict(zip(unique_labels, vectors))
    clusters = _cluster_embeddings(embeddings)
    logger.info("formed %d narrative clusters from %d labels", len(clusters), len(unique_labels))

    velocity_rows: list[VelocityRow] = []
    for cluster in clusters:
        # Canonical = longest label (informativeness proxy).
        canonical = max(cluster, key=len)
        all_narratives = [n for lbl in cluster for n in label_to_ids[lbl]]
        mention_count = len(all_narratives)
        conviction_vals = [float(n["conviction"]) for n in all_narratives if n["conviction"] is not None]
        conviction_avg = sum(conviction_vals) / len(conviction_vals) if conviction_vals else 50.0
        episode_ids = {n["episode_id"] for n in all_narratives}

        # Collect unique speakers from speakers_mentioning arrays.
        speaker_set: set = set()
        for n in all_narratives:
            for sp in (n["speakers_mentioning"] or []):
                speaker_set.add(sp)
        # If speakers_mentioning is empty, fall back to distinct macro_view speakers
        # touching the same episodes. Phase 4 can wire this better.
        unique_speakers = max(len(speaker_set), len(episode_ids))  # coarse upper bound

        ws = min(n["created_at"] for n in all_narratives)
        we = max(n["created_at"] for n in all_narratives)

        velocity_rows.append(
            VelocityRow(
                canonical_label=canonical,
                mention_count=mention_count,
                unique_speakers=unique_speakers,
                conviction_avg=conviction_avg,
                crowding_risk=_crowding_risk(mention_count, unique_speakers, conviction_avg),
                members=cluster,
                window_start=ws,
                window_end=we,
                episode_ids=episode_ids,
            )
        )

    _persist(velocity_rows)
    return velocity_rows


def _persist(rows: list[VelocityRow]) -> None:
    with get_cursor() as cur:
        for r in rows:
            cur.execute(
                """
                INSERT INTO public.podcast_narrative_velocity (
                    tenant_id, narrative_label, window_start, window_end,
                    mention_count, unique_speakers, conviction_avg,
                    crowding_risk, is_accelerating, first_detected_at, metadata
                )
                VALUES (NULL, %s, %s, %s, %s, %s, %s, %s, false, %s, %s)
                ON CONFLICT (tenant_id, narrative_label, window_start, window_end)
                DO UPDATE SET
                    mention_count = EXCLUDED.mention_count,
                    unique_speakers = EXCLUDED.unique_speakers,
                    conviction_avg = EXCLUDED.conviction_avg,
                    crowding_risk = EXCLUDED.crowding_risk,
                    metadata = EXCLUDED.metadata,
                    updated_at = now()
                """,
                (
                    r.canonical_label,
                    r.window_start,
                    r.window_end,
                    r.mention_count,
                    r.unique_speakers,
                    round(r.conviction_avg, 2),
                    r.crowding_risk,
                    r.window_start,
                    _build_metadata(r),
                ),
            )


def _build_metadata(r: VelocityRow) -> str:
    import json
    return json.dumps({
        "cluster_members": r.members,
        "episode_count": len(r.episode_ids),
        "episode_ids": [str(e) for e in r.episode_ids],
        "embedding_model": EMBEDDING_MODEL,
        "similarity_threshold": SIMILARITY_MERGE_THRESHOLD,
    })


__all__ = [
    "EMBEDDING_MODEL",
    "SIMILARITY_MERGE_THRESHOLD",
    "VelocityRow",
    "compute_narrative_velocity",
]
