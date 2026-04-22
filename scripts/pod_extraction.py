#!/usr/bin/env python3
"""Podcast extraction scheduled task.

Polls podcast_episodes for transcription_status='completed' AND
extraction_status='pending' rows, then runs the 4-pass extraction pipeline
+ Pass 3 synthesis against each one. Exits after clearing the queue (or
hitting max_per_run).

Schedule (planned): every 30 min, or on-demand after ingest.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env", override=True)

    from app.db import get_cursor
    from app.services.podcast_extraction import extract_episode
    from app.services.podcast_synthesis import synthesize_episode

    max_per_run = int(sys.argv[1]) if len(sys.argv) > 1 else 5

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT episode_id, title, tenant_id FROM public.podcast_episodes
            WHERE transcription_status = 'completed' AND extraction_status = 'pending'
            ORDER BY created_at ASC LIMIT %s
            """,
            (max_per_run,),
        )
        pending = cur.fetchall()

    if not pending:
        print(json.dumps({"status": "idle", "processed": 0}))
        return 0

    results = []
    for row in pending:
        eid = row["episode_id"]
        title = row["title"][:50]
        try:
            r = extract_episode(eid, tenant_id=row["tenant_id"])
            ext_status = "completed" if not r.errors else "partial"
            # Run synthesis only if extraction succeeded
            synth_ok = False
            if not r.errors or len(r.errors) < 3:
                synth = synthesize_episode(eid)
                synth_ok = synth.error is None
            results.append({
                "episode_id": str(eid),
                "title": title,
                "extraction": ext_status,
                "macro": r.macro_views_written,
                "narratives": r.narratives_written,
                "analogs": r.analogs_written,
                "synth_ok": synth_ok,
                "errors": len(r.errors),
            })
        except Exception as e:  # noqa: BLE001
            results.append({
                "episode_id": str(eid),
                "title": title,
                "extraction": "failed",
                "error": f"{type(e).__name__}: {e}",
            })

    print(json.dumps({
        "status": "done",
        "processed": len(results),
        "results": results,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
