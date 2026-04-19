#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app"
PIDFILE="$ROOT/verification/loop_state/repe_codex_os_waker.pid"

if [[ ! -f "$PIDFILE" ]]; then
  echo "No PID file found at $PIDFILE"
  exit 0
fi

PID="$(tr -d '[:space:]' < "$PIDFILE")"
if [[ -n "$PID" ]]; then
  kill "$PID" 2>/dev/null || true
fi
rm -f "$PIDFILE"
echo "Stopped REPE Codex OS waker"
