#!/usr/bin/env python3
"""OS-level wake bridge for the supervised REPE loop."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BRIDGE_PATH = REPO_ROOT / "verification" / "loop_state" / "repe_supervised_bridge.json"
DEFAULT_STATE_PATH = REPO_ROOT / "verification" / "loop_state" / "repe_codex_os_waker_state.json"
DEFAULT_AUTOMATION_ID = "claude-repe-watch"
CODEx_SIGNALS = {"awaiting_codex", "awaiting_deploy", "awaiting_live_verify", "blocked"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class WakerState:
    last_observed_version: int = -1
    last_triggered_version: int = -1
    last_bridge_signal: str = ""
    last_requested_actor: str = ""
    last_thread_id: str = ""
    last_triggered_at: str = ""
    last_result: str = ""
    last_summary: str = ""


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def load_state(path: Path) -> WakerState:
    if not path.exists():
        return WakerState()
    raw = json.loads(path.read_text())
    defaults = asdict(WakerState())
    return WakerState(**{key: raw.get(key, value) for key, value in defaults.items()})


def save_state(path: Path, state: WakerState) -> None:
    write_json(path, asdict(state))


def resolve_automation_toml(automation_id: str) -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    return codex_home / "automations" / automation_id / "automation.toml"


def resolve_thread_id(automation_id: str, override_thread_id: str | None) -> str:
    if override_thread_id:
        return override_thread_id
    automation_toml = resolve_automation_toml(automation_id)
    if not automation_toml.exists():
        raise FileNotFoundError(f"Automation config not found: {automation_toml}")
    raw = tomllib.loads(automation_toml.read_text())
    thread_id = raw.get("target_thread_id")
    if not isinstance(thread_id, str) or not thread_id.strip():
        raise ValueError(f"Automation {automation_id} does not have target_thread_id")
    return thread_id.strip()


def should_trigger(bridge: dict[str, Any], state: WakerState) -> bool:
    version = int(bridge.get("version", -1))
    signal = str(bridge.get("signal", "")).strip()
    requested_actor = str(bridge.get("requested_actor", "")).strip()
    if requested_actor != "codex":
        return False
    if signal not in CODEx_SIGNALS:
        return False
    if version <= state.last_triggered_version:
        return False
    return True


def build_wake_message(bridge: dict[str, Any], bridge_path: Path) -> str:
    details = bridge.get("details", {}) if isinstance(bridge.get("details"), dict) else {}
    loop_json = bridge_path.parent / "repe_supervised_loop.json"
    loop_md = bridge_path.parent / "repe_supervised_loop.md"
    version = bridge.get("version", "")
    signal = bridge.get("signal", "")
    phase = bridge.get("phase", "")
    summary = bridge.get("summary", "")
    next_action = details.get("next_action", "")
    return (
        "Bridge wake-up. Read `verification/loop_state/repe_supervised_bridge.json` first and only continue if "
        f"bridge version `{version}` still requests Codex. Then read `{loop_json}` and `{loop_md}`, inspect the active "
        "Claude Code session in VS Code, and continue the Meridian / REPE supervised loop without waiting for manual input. "
        "After each meaningful action, update the bridge and loop-state artifacts so ownership is explicit again.\n\n"
        f"Wake source:\n- signal: `{signal}`\n- phase: `{phase}`\n- summary: {summary}\n- next: {next_action}"
    )


def run_command(cmd: list[str], dry_run: bool = False) -> None:
    if dry_run:
        print(json.dumps({"dry_run": True, "command": cmd}))
        return
    subprocess.run(cmd, check=True)


def send_wake_message(thread_id: str, message: str, dry_run: bool = False) -> None:
    deep_link = f"codex://threads/{thread_id}"
    run_command(["open", deep_link], dry_run=dry_run)
    if dry_run:
        return
    time.sleep(1.2)
    applescript = """
on run argv
  set wakeText to item 1 of argv
  set oldClipboard to ""
  try
    set oldClipboard to the clipboard
  end try
  tell application "Codex" to activate
  delay 0.8
  set the clipboard to wakeText
  tell application "System Events"
    keystroke "v" using command down
    delay 0.15
    key code 36
  end tell
  delay 0.15
  try
    set the clipboard to oldClipboard
  end try
end run
""".strip()
    subprocess.run(["osascript", "-e", applescript, message], check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Wake the Codex thread immediately when the REPE bridge hands off to Codex.")
    parser.add_argument("--bridge", default=str(DEFAULT_BRIDGE_PATH), help="Path to the strict bridge JSON file.")
    parser.add_argument("--state", default=str(DEFAULT_STATE_PATH), help="Path to the local wake dedupe state JSON file.")
    parser.add_argument("--automation-id", default=DEFAULT_AUTOMATION_ID, help="Automation ID whose target_thread_id should be used.")
    parser.add_argument("--thread-id", default=None, help="Explicit thread id override. Defaults to target_thread_id from the automation TOML.")
    parser.add_argument("--dry-run", action="store_true", help="Log actions without opening Codex or sending a wake message.")
    parser.add_argument("--print-message", action="store_true", help="Print the wake message that would be sent.")
    parser.add_argument("--watch", action="store_true", help="Run continuously and poll the bridge on an interval.")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval in seconds for --watch mode.")
    return parser.parse_args()


def run_once(args: argparse.Namespace) -> int:
    bridge_path = Path(args.bridge)
    state_path = Path(args.state)
    if not bridge_path.exists():
        print(f"Bridge file not found: {bridge_path}", file=sys.stderr)
        return 1

    bridge = read_json(bridge_path)
    state = load_state(state_path)
    state.last_observed_version = int(bridge.get("version", state.last_observed_version))
    state.last_bridge_signal = str(bridge.get("signal", ""))
    state.last_requested_actor = str(bridge.get("requested_actor", ""))
    state.last_summary = str(bridge.get("summary", ""))

    if not should_trigger(bridge, state):
        save_state(state_path, state)
        print(json.dumps({"triggered": False, "reason": "bridge_not_ready_for_codex", "bridge_version": state.last_observed_version}))
        return 0

    thread_id = resolve_thread_id(args.automation_id, args.thread_id)
    state.last_thread_id = thread_id
    message = build_wake_message(bridge, bridge_path)
    if args.print_message:
        print(message)

    send_wake_message(thread_id, message, dry_run=args.dry_run)
    state.last_triggered_version = int(bridge.get("version", state.last_triggered_version))
    state.last_triggered_at = utc_now()
    state.last_result = "dry_run" if args.dry_run else "sent_wake_message"
    save_state(state_path, state)
    print(json.dumps({"triggered": True, "thread_id": thread_id, "bridge_version": state.last_triggered_version, "result": state.last_result}))
    return 0


def main() -> int:
    args = parse_args()
    if not args.watch:
        return run_once(args)

    while True:
        try:
            run_once(args)
        except KeyboardInterrupt:
            return 0
        except Exception as exc:  # pragma: no cover
            print(json.dumps({"triggered": False, "reason": "watch_iteration_failed", "error": str(exc)}), file=sys.stderr)
        time.sleep(max(args.interval, 0.5))


if __name__ == "__main__":
    raise SystemExit(main())
