#!/usr/bin/env python3
"""
Minimal self-test for the lightweight retrieval layer.

This is intentionally not a full test harness; it exists to validate that:
- retrieval returns at least one snippet for a known query
- denylist does not accidentally exclude allowed roots
"""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    # Ensure `backend/` is on sys.path so `import app.*` works when run from repo root.
    backend_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_dir))

    try:
        from app.ai.retrieval import retrieve_snippets
    except Exception as e:
        print(f"FAIL: could not import retrieval module: {e}", file=sys.stderr)
        return 2

    query = "/v1/environments"
    snippets = retrieve_snippets(query=query, allowed_roots=["repo-c"], top_k=3, max_files=10, max_bytes=50_000)

    if not snippets:
        print(f"FAIL: expected snippets for query {query!r}, got 0", file=sys.stderr)
        return 1

    paths = {s.path for s in snippets}
    if "repo-c/app/main.py" not in paths:
        print(f"FAIL: expected repo-c/app/main.py citation, got: {sorted(paths)[:10]}", file=sys.stderr)
        return 1

    print("OK")
    print(f"snippets={len(snippets)}")
    for s in snippets[:3]:
        print(f"- {s.path}:{s.start_line}-{s.end_line} ({len(s.text.encode('utf-8'))} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
