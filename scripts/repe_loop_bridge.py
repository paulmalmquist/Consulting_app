#!/usr/bin/env python3
"""Strict baton-pass bridge for the supervised REPE loop.

This script creates and updates a machine-readable completion signal that sits
next to the broader scratchpad-style loop state. The goal is to make Claude ->
Codex and Codex -> Claude handoffs deterministic instead of relying on chat
timing or heartbeat polling alone.

Examples:
  python scripts/repe_loop_bridge.py init --run-id repe-meridian-2026-04-19
  python scripts/repe_loop_bridge.py mark \
    --actor claude \
    --phase 5_live_verify \
    --signal awaiting_codex \
    --summary "Claude finished live remediation pass and needs Codex review."
  python scripts/repe_loop_bridge.py watch --for-signal awaiting_codex --once
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = REPO_ROOT / "verification" / "loop_state" / "repe_supervised_bridge.json"

VALID_SIGNALS = {
    "idle",
    "awaiting_claude",
    "awaiting_codex",
    "awaiting_deploy",
    "awaiting_live_verify",
    "blocked",
    "complete",
}

VALID_ACTORS = {"claude", "codex", "user", "system"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_bridge(run_id: str = "") -> dict[str, Any]:
    return {
        "run_id": run_id,
        "version": 0,
        "signal": "idle",
        "phase": "",
        "requested_actor": "",
        "updated_by": "",
        "updated_at": utc_now(),
        "summary": "",
        "details": {
            "chatgpt_project": "",
            "chatgpt_chat": "",
            "claude_conversation": "",
            "files_touched": [],
            "tests_run": [],
            "deploy_status": "",
            "live_verification_status": "",
            "blocking_issue": "",
            "next_action": "",
        },
    }


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return default_bridge()
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Strict baton-pass bridge for the supervised REPE loop.")
    parser.add_argument("--path", default=str(DEFAULT_PATH), help="Path to the bridge JSON file.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="Initialize the bridge file.")
    init_parser.add_argument("--run-id", required=True, help="Stable run identifier.")
    init_parser.add_argument("--chatgpt-project", default="", help="Optional ChatGPT project.")
    init_parser.add_argument("--chatgpt-chat", default="", help="Optional ChatGPT chat title.")
    init_parser.add_argument("--claude-conversation", default="", help="Optional Claude conversation name.")

    mark_parser = subparsers.add_parser("mark", help="Write a deterministic handoff signal.")
    mark_parser.add_argument("--run-id", help="Override or backfill the run id.")
    mark_parser.add_argument("--actor", required=True, choices=sorted(VALID_ACTORS))
    mark_parser.add_argument("--phase", required=True, help="Current phase.")
    mark_parser.add_argument("--signal", required=True, choices=sorted(VALID_SIGNALS))
    mark_parser.add_argument("--requested-actor", choices=sorted(VALID_ACTORS), help="Who should act next.")
    mark_parser.add_argument("--summary", required=True, help="One-line completion or blocker summary.")
    mark_parser.add_argument("--next-action", default="", help="Deterministic next action.")
    mark_parser.add_argument("--deploy-status", default="", help="Current deploy status.")
    mark_parser.add_argument("--live-status", default="", help="Current live verification status.")
    mark_parser.add_argument("--blocking-issue", default="", help="Blocking issue if any.")
    mark_parser.add_argument("--files-touched", nargs="*", default=[], help="Files touched in this pass.")
    mark_parser.add_argument("--tests-run", nargs="*", default=[], help="Checks run in this pass.")

    watch_parser = subparsers.add_parser("watch", help="Wait for a bridge signal.")
    watch_parser.add_argument("--for-signal", choices=sorted(VALID_SIGNALS), help="Only exit when this signal appears.")
    watch_parser.add_argument("--since-version", type=int, default=-1, help="Only exit for a newer version.")
    watch_parser.add_argument("--timeout", type=float, default=300.0, help="Seconds to wait before timing out.")
    watch_parser.add_argument("--interval", type=float, default=2.0, help="Polling interval in seconds.")
    watch_parser.add_argument("--once", action="store_true", help="Read once and exit immediately.")

    return parser.parse_args()


def cmd_init(path: Path, args: argparse.Namespace) -> int:
    payload = default_bridge(args.run_id)
    payload["details"]["chatgpt_project"] = args.chatgpt_project
    payload["details"]["chatgpt_chat"] = args.chatgpt_chat
    payload["details"]["claude_conversation"] = args.claude_conversation
    write_json(path, payload)
    print(json.dumps(payload, indent=2))
    return 0


def cmd_mark(path: Path, args: argparse.Namespace) -> int:
    payload = read_json(path)
    payload.setdefault("details", {})
    payload["run_id"] = args.run_id or payload.get("run_id", "")
    payload["version"] = int(payload.get("version", 0)) + 1
    payload["signal"] = args.signal
    payload["phase"] = args.phase
    payload["requested_actor"] = args.requested_actor or ""
    payload["updated_by"] = args.actor
    payload["updated_at"] = utc_now()
    payload["summary"] = args.summary
    payload["details"]["files_touched"] = args.files_touched
    payload["details"]["tests_run"] = args.tests_run
    payload["details"]["deploy_status"] = args.deploy_status
    payload["details"]["live_verification_status"] = args.live_status
    payload["details"]["blocking_issue"] = args.blocking_issue
    payload["details"]["next_action"] = args.next_action
    write_json(path, payload)
    print(json.dumps(payload, indent=2))
    return 0


def signal_matches(payload: dict[str, Any], wanted_signal: str | None, since_version: int) -> bool:
    version = int(payload.get("version", -1))
    if version <= since_version:
        return False
    if wanted_signal and payload.get("signal") != wanted_signal:
        return False
    return True


def cmd_watch(path: Path, args: argparse.Namespace) -> int:
    started = time.monotonic()
    while True:
        payload = read_json(path)
        if signal_matches(payload, args.for_signal, args.since_version):
            print(json.dumps(payload, indent=2))
            return 0
        if args.once:
            print(json.dumps(payload, indent=2))
            return 1
        if time.monotonic() - started >= args.timeout:
            print(json.dumps(payload, indent=2))
            return 2
        time.sleep(args.interval)


def main() -> int:
    args = parse_args()
    path = Path(args.path)
    if args.command == "init":
        return cmd_init(path, args)
    if args.command == "mark":
        return cmd_mark(path, args)
    if args.command == "watch":
        return cmd_watch(path, args)
    raise SystemExit(f"unknown command: {args.command}")


if __name__ == "__main__":
    sys.exit(main())
