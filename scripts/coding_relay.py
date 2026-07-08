#!/usr/bin/env python3
"""Anywhere-entry wrapper for the Coding Relay.

`python -m orchestration.coding_relay` needs cwd = repo root (orchestration/
is a namespace package). This wrapper works from any directory.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.__main__ import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
