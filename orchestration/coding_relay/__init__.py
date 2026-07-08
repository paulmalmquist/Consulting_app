"""Coding Relay: bounded Claude-builds / Codex-reviews loop with receipts.

Claude CLI is the primary implementer inside an isolated git worktree.
Codex CLI reviews each pass from a neutral artifact bundle (never the repo)
and returns a structured JSON verdict. The loop stops on pass, blocker,
risk escalation, safety violation, or max iterations, then writes a final
report and (on pass) can open a draft PR.

Entry points:
    python -m orchestration.coding_relay   (from repo root)
    python scripts/coding_relay.py         (from anywhere)

Reference doc: docs/reference/CODING_RELAY.md
"""
from __future__ import annotations

RELAY_VERSION = "0.1.0"
