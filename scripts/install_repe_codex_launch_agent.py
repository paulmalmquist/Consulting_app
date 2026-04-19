#!/usr/bin/env python3
"""Install or refresh the launchd watcher for the REPE Codex wake bridge."""

from __future__ import annotations

import argparse
import os
import plistlib
import signal
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BRIDGE_PATH = REPO_ROOT / "verification" / "loop_state" / "repe_supervised_bridge.json"
DEFAULT_STATE_PATH = REPO_ROOT / "verification" / "loop_state" / "repe_codex_os_waker_state.json"
DEFAULT_PLIST_PATH = REPO_ROOT / "ops" / "launchd" / "com.openai.codex.repe-bridge.plist"
DEFAULT_LABEL = "com.openai.codex.repe-bridge"
DEFAULT_AUTOMATION_ID = "claude-repe-watch"
DEFAULT_PID_PATH = REPO_ROOT / "verification" / "loop_state" / "repe_codex_os_waker.pid"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Install or update the REPE Codex bridge launch agent.")
    parser.add_argument("--label", default=DEFAULT_LABEL)
    parser.add_argument("--automation-id", default=DEFAULT_AUTOMATION_ID)
    parser.add_argument("--bridge", default=str(DEFAULT_BRIDGE_PATH))
    parser.add_argument("--state", default=str(DEFAULT_STATE_PATH))
    parser.add_argument("--plist-path", default=str(DEFAULT_PLIST_PATH))
    parser.add_argument("--pid-path", default=str(DEFAULT_PID_PATH))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def run(cmd: list[str], dry_run: bool) -> int:
    if dry_run:
        print("DRY_RUN", " ".join(cmd))
        return 0
    return subprocess.run(cmd, check=False).returncode


def background_start(script_path: Path, bridge: Path, state: Path, automation_id: str, pid_path: Path, log_path: Path, dry_run: bool) -> str:
    pid_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    if pid_path.exists():
        try:
            old_pid = int(pid_path.read_text().strip())
            if old_pid > 0:
                if dry_run:
                    print(f"DRY_RUN kill existing pid {old_pid}")
                else:
                    os.kill(old_pid, signal.SIGTERM)
        except Exception:
            pass
        if not dry_run:
            pid_path.unlink(missing_ok=True)
    if dry_run:
        print(
            "DRY_RUN",
            [
                sys.executable,
                str(script_path),
                "--watch",
                "--interval",
                "5",
                "--bridge",
                str(bridge),
                "--state",
                str(state),
                "--automation-id",
                automation_id,
            ],
        )
        return "dry_run"
    with log_path.open("ab") as log_handle:
        proc = subprocess.Popen(
            [
                sys.executable,
                str(script_path),
                "--watch",
                "--interval",
                "5",
                "--bridge",
                str(bridge),
                "--state",
                str(state),
                "--automation-id",
                automation_id,
            ],
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=log_handle,
            start_new_session=True,
            close_fds=True,
        )
    pid_path.write_text(f"{proc.pid}\n")
    return str(proc.pid)


def main() -> int:
    args = parse_args()
    plist_path = Path(args.plist_path).resolve()
    pid_path = Path(args.pid_path).resolve()
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    logs_dir = REPO_ROOT / "verification" / "loop_state" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    script_path = REPO_ROOT / "scripts" / "repe_codex_os_waker.py"
    python_path = Path(sys.executable).resolve()
    stdout_path = logs_dir / "repe_codex_os_waker.out.log"
    stderr_path = logs_dir / "repe_codex_os_waker.err.log"
    background_log = logs_dir / "repe_codex_os_waker.daemon.log"

    plist_payload = {
        "Label": args.label,
        "ProgramArguments": [
            str(python_path),
            str(script_path),
            "--bridge",
            str(Path(args.bridge).resolve()),
            "--state",
            str(Path(args.state).resolve()),
            "--automation-id",
            args.automation_id,
        ],
        "RunAtLoad": True,
        "WatchPaths": [str(Path(args.bridge).resolve())],
        "StartInterval": 60,
        "StandardOutPath": str(stdout_path),
        "StandardErrorPath": str(stderr_path),
    }

    if args.dry_run:
        print(plistlib.dumps(plist_payload).decode("utf-8"))
        return 0

    plist_path.write_bytes(plistlib.dumps(plist_payload))
    uid = subprocess.check_output(["id", "-u"], text=True).strip()
    domain = f"gui/{uid}"
    run(["launchctl", "bootout", domain, str(plist_path)], dry_run=False)
    bootstrap_rc = run(["launchctl", "bootstrap", domain, str(plist_path)], dry_run=False)
    kickstart_rc = run(["launchctl", "kickstart", "-k", f"{domain}/{args.label}"], dry_run=False) if bootstrap_rc == 0 else 1
    if bootstrap_rc == 0 and kickstart_rc == 0:
        print(f"Installed launchd watcher {args.label} -> {plist_path}")
        return 0
    pid = background_start(
        script_path=script_path,
        bridge=Path(args.bridge).resolve(),
        state=Path(args.state).resolve(),
        automation_id=args.automation_id,
        pid_path=pid_path,
        log_path=background_log,
        dry_run=False,
    )
    print(f"Launchd bootstrap failed; started background watcher pid {pid} using {script_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
