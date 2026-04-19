# REPE Codex OS Waker

This is the OS-level follow-up to the repo bridge.

## Purpose

The strict bridge file tells the system when Claude has explicitly handed the baton back to Codex.

The OS waker closes the last gap by:

1. watching the bridge file with `launchd`
2. deduping by bridge `version`
3. opening the exact Codex thread through `codex://threads/<thread_id>`
4. sending one atomic wake-up message into that thread

That removes the need for a manual “Claude is done” nudge and makes the resume path much faster than heartbeat polling alone.

## Files

- watcher: [scripts/repe_codex_os_waker.py](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/repe_codex_os_waker.py)
- installer: [scripts/install_repe_codex_launch_agent.py](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/install_repe_codex_launch_agent.py)
- stop helper: [scripts/stop_repe_codex_os_waker.sh](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/stop_repe_codex_os_waker.sh)
- launch agent plist: [ops/launchd/com.openai.codex.repe-bridge.plist](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/ops/launchd/com.openai.codex.repe-bridge.plist)
- dedupe state: [verification/loop_state/repe_codex_os_waker_state.json](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/verification/loop_state/repe_codex_os_waker_state.json)

## Trigger Contract

The watcher only sends a wake-up when:

- `requested_actor == "codex"`
- `signal` is one of:
  - `awaiting_codex`
  - `awaiting_deploy`
  - `awaiting_live_verify`
  - `blocked`
- the bridge `version` is newer than the last triggered version

## Thread Resolution

The watcher resolves the target thread from:

- `~/.codex/automations/claude-repe-watch/automation.toml`

It reads `target_thread_id` from the automation so the wake-up stays aligned with the real thread.

## Install

```bash
python scripts/install_repe_codex_launch_agent.py
```

This writes a launchd plist into the repo and bootstraps it into the current user session.

If `launchctl` cannot register from the current environment, the installer falls back to a repo-local background watcher and writes:

- [verification/loop_state/repe_codex_os_waker.pid](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/verification/loop_state/repe_codex_os_waker.pid)
- [verification/loop_state/logs/repe_codex_os_waker.daemon.log](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/verification/loop_state/logs/repe_codex_os_waker.daemon.log)

Stop that fallback with:

```bash
bash scripts/stop_repe_codex_os_waker.sh
```

## Logs

- [verification/loop_state/logs/repe_codex_os_waker.out.log](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/verification/loop_state/logs/repe_codex_os_waker.out.log)
- [verification/loop_state/logs/repe_codex_os_waker.err.log](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/verification/loop_state/logs/repe_codex_os_waker.err.log)

## Dry Run

```bash
python scripts/repe_codex_os_waker.py --dry-run --print-message
```

## Caveat

This is still GUI automation, not a private Codex API.

The wake-up path works by:

- opening the exact thread via deep link
- pasting one single wake-up message
- sending it once

That makes it much more immediate than waiting for the next heartbeat, but it still depends on the macOS desktop session and Codex UI being available.
