# REPE Loop Bridge

This bridge closes the gap between "Claude finished coding" and "Codex wakes up and knows exactly why."

## Problem

The broader loop state file is useful, but it is too open-ended to act as a sharp completion trigger. A heartbeat can wake up and read it, but it still has to infer whether:

- Claude is actually done with a chunk
- Codex should resume now
- a deploy is waiting
- live verification is waiting
- the loop is blocked

That ambiguity is what makes the baton pass feel unreliable.

## Bridge Artifacts

- Human-readable loop log:
  - `verification/loop_state/repe_supervised_loop.md`
- Broad machine-readable state:
  - `verification/loop_state/repe_supervised_loop.json`
- Strict baton-pass signal:
  - `verification/loop_state/repe_supervised_bridge.json`

The bridge file is the completion signal. It should change every time ownership or action priority changes.

## Signal Contract

The bridge file has a small state machine:

- `idle`
- `awaiting_claude`
- `awaiting_codex`
- `awaiting_deploy`
- `awaiting_live_verify`
- `blocked`
- `complete`

Required fields:

- `run_id`
- `version`
- `signal`
- `phase`
- `requested_actor`
- `updated_by`
- `updated_at`
- `summary`
- `details.next_action`

The `version` field must increment every time the signal changes or a new baton pass is written. That lets a watcher detect a new event without diffing free-form markdown.

## Script

Use:

```bash
python scripts/repe_loop_bridge.py init --run-id repe-meridian-2026-04-19
python scripts/repe_loop_bridge.py mark \
  --actor claude \
  --phase 5_live_verify \
  --signal awaiting_codex \
  --requested-actor codex \
  --summary "Claude finished remediation chunk and needs Codex live verification." \
  --next-action "Codex should open the live site in incognito and verify the changed surfaces."
python scripts/repe_loop_bridge.py watch --for-signal awaiting_codex --since-version 12
```

## Recommended Handoff Rules

When Claude finishes a coding chunk:

1. update `repe_supervised_loop.json`
2. append to `repe_supervised_loop.md`
3. write `repe_supervised_bridge.json` with one of:
   - `awaiting_codex`
   - `awaiting_deploy`
   - `awaiting_live_verify`
   - `blocked`
   - `complete`

When Codex finishes review, deploy coordination, or live verification:

1. update `repe_supervised_loop.json`
2. append to `repe_supervised_loop.md`
3. write `repe_supervised_bridge.json` with one of:
   - `awaiting_claude`
   - `blocked`
   - `complete`

## Automation Pattern

The heartbeat or any local watcher should:

1. read `repe_supervised_bridge.json`
2. compare `version` to the last-seen version
3. only act when a new version appears
4. route based on `signal` and `requested_actor`

That means the wake-up logic no longer has to guess from a long transcript or a loosely structured state file.

## What This Solves

- Claude can finish without a human typing "it’s done"
- Codex has a strict trigger to react to
- interrupted tool edits do not erase the baton because the completion signal is its own file
- overnight loops become much more deterministic
