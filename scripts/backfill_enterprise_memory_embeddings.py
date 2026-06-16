#!/usr/bin/env python3
"""Backfill embeddings for enterprise-memory rows still marked 'pending'.

The /index route fills embeddings via an in-process FastAPI BackgroundTask, which is lost if
the backend restarts before it runs. The embedding_status='pending' column is the durable
source of truth; this manual sweep finishes any rows the background path didn't. NOT
scheduled — run it by hand (same doctrine as scripts/export_sessions_to_bq.py). Fails closed:
if no embedding provider is configured, rows are marked 'no_provider', never given a fake
vector.

Usage:
    python scripts/backfill_enterprise_memory_embeddings.py [--limit 200]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill pending enterprise-memory embeddings.")
    parser.add_argument("--limit", type=int, default=200, help="max rows to process this run")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env", override=True)

    from app.services import enterprise_memory

    pending = enterprise_memory.list_pending(limit=args.limit)
    results = {"processed": 0, "indexed": 0, "no_provider": 0, "error": 0}
    for item_id in pending:
        out = enterprise_memory.embed_pending_item(item_id)
        results["processed"] += 1
        status = out.get("embedding_status")
        if status in results:
            results[status] += 1

    print(json.dumps({"ok": True, "pending_seen": len(pending), **results}, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
