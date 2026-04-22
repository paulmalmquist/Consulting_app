#!/usr/bin/env python3
"""Narrative velocity scheduled task.

Recomputes cross-episode narrative clusters + velocity aggregates.
Writes the current snapshot to docs/podcast-intelligence/velocity/YYYY-MM-DD.json
and also to the podcast_narrative_velocity DB table.

Schedule (planned): daily 6:00 AM.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env", override=True)

    from app.db import get_cursor
    from app.services.podcast_narrative_velocity import (
        SIMILARITY_MERGE_THRESHOLD,
        compute_narrative_velocity,
    )

    # Wipe prior snapshot rows for clean replace (simple for Phase 4 v1).
    # Phase 4.5 will add rolling 7d/30d/90d windows instead of overwriting.
    with get_cursor() as cur:
        cur.execute("DELETE FROM public.podcast_narrative_velocity")
        print(f"[pod_narrative_velocity] cleared {cur.rowcount} stale rows", file=sys.stderr)

    rows = compute_narrative_velocity()
    cross_ep = [r for r in rows if len(r.episode_ids) >= 2]

    # Write snapshot to docs/
    out_dir = repo_root / "docs" / "podcast-intelligence" / "velocity"
    out_dir.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "generated_at": date.today().isoformat(),
        "total_canonical_narratives": len(rows),
        "cross_episode_count": len(cross_ep),
        "similarity_threshold": SIMILARITY_MERGE_THRESHOLD,
        "cross_episode_narratives": [
            {
                "canonical_label": r.canonical_label,
                "mention_count": r.mention_count,
                "unique_speakers": r.unique_speakers,
                "conviction_avg": round(r.conviction_avg, 2),
                "crowding_risk": r.crowding_risk,
                "episode_count": len(r.episode_ids),
                "cluster_members": r.members,
            }
            for r in sorted(cross_ep, key=lambda x: (-len(x.episode_ids), -x.mention_count))
        ],
    }
    out_file = out_dir / f"{date.today().isoformat()}.json"
    out_file.write_text(json.dumps(snapshot, indent=2))

    print(json.dumps({
        "status": "done",
        "total_canonical": len(rows),
        "cross_episode": len(cross_ep),
        "output": str(out_file.relative_to(repo_root)),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
