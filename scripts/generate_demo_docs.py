#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.services.winston_demo_docs import demo_docs_dir, generate_demo_docs

    output_dir = demo_docs_dir()
    docs = generate_demo_docs(output_dir)
    print(f"Generated {len(docs)} demo documents in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
