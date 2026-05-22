# HappyCo Automation Cadence

Last updated: 2026-05-22

This document describes the nightly and weekly Claude CoWork operating cadence
for the HappyCo Property Ops Intelligence Kit. It explains what each scheduled
task does, how the tasks fit together, and how the cadence is meant to be
scheduled later.

This is a planning and operations document. No recurring schedule is created by
this PR. Tasks run today only when triggered by hand.

## Purpose

The HappyCo package is a private, invite-gated proof-of-work built on
deterministic synthetic data. Once the package is shared with a recruiter, it
needs to stay accurate without a manual audit every day. The cadence keeps the
gated routes, artifacts, Databricks evidence, and recruiter-facing copy honest
between the moment the package is shared and the moment it is reviewed.

The cadence does three things:

1. Catches regressions early — a broken gate, a leaked artifact, an overclaim.
2. Keeps receipts current — QA receipts, control-room status, Databricks state.
3. Prepares review material — Loom storyboard, role-fit gap analysis, recruiter
   draft — without ever sending anything automatically.

## Cadence overview

### Nightly (5 tasks)

| # | Task | What it produces |
|---|------|------------------|
| 1 | HappyCo Proof Package Nightly QA | Dated QA receipt with route/API evidence |
| 2 | Automation Control Room Refresh | Honest control-room status copy |
| 3 | Databricks Weather Risk Run / Receipt Check | `bundle validate` result; run/receipt status |
| 4 | Artifact Regeneration | Refreshed Excel, deck, SVG, API excerpts, ML files |
| 5 | Recruiter Draft Prep — Draft Only | A follow-up draft, gated-link placeholder, proof points |

### Weekly (2 tasks)

| # | Task | What it produces |
|---|------|------------------|
| 6 | Weekly Role-Fit Gap Analysis | Coverage matrix vs. the Head-of-Data requirements |
| 7 | Weekly Loom/Demo Storyboard Refresh | Refreshed 5-7 minute Loom script and claim sheet |

The exact task prompts live in
[`claude-cowork-nightly-tasks.md`](claude-cowork-nightly-tasks.md).

## How the tasks relate

The nightly tasks run in order. Task 1 establishes ground truth for the night;
tasks 2-5 consume it.

```
Task 1 QA  ─┬─►  Task 2 Control Room (status copy reflects QA result)
            ├─►  Task 4 Artifact Regeneration (skips if QA found a blocker)
            └─►  Task 5 Recruiter Draft (proof points must match QA evidence)

Task 3 Databricks ──►  Task 2 Control Room (Databricks row reflects run state)
                  └──►  Task 5 Recruiter Draft (Databricks claim must match receipt)
```

Weekly task 6 reads the latest nightly QA receipt and the implementation plan to
score role coverage. Weekly task 7 reads the QA receipt and the claims sheet to
refresh the Loom storyboard.

If task 1 reports a blocking failure — a broken gate, a leaked artifact, an
overclaim in shipped copy — tasks 2, 4, and 5 should stop and surface the
failure rather than refresh copy or drafts on top of a broken state.

## Safety gates baked into the cadence

These rules are non-negotiable and are repeated in each task prompt:

- No task sends email. Task 5 produces a draft only.
- No task creates a real recurring schedule.
- No task exposes or prints an invite code.
- No task claims a live Databricks run unless a fresh receipt proves it. The
  current weather-risk sample bundle is `mode: local_fallback` with placeholder
  chart PNGs — a task that calls it a live run is wrong.
- No task publishes artifacts to a public path. Artifacts stay local/private or
  behind the gated artifact API.
- Every claim a task writes must match
  [`claims-and-caveats.md`](claims-and-caveats.md).

## How to schedule this later (not done in this PR)

The cadence is designed to run unattended later. When it is time to schedule it:

1. Pick a runner — the Claude CoWork scheduler, a cron job, or a CI nightly
   workflow. The 22+ existing Novendor scheduled tasks (see `docs/LATEST.md`)
   are the model to copy.
2. Suggested timing: nightly tasks between 1 AM and 4 AM local so receipts are
   ready before the morning. Stagger them so task 1 finishes before tasks 2-5
   begin. Weekly tasks on a fixed weekday morning.
3. Wire outputs into a dated receipt folder, for example
   `docs/runbooks/happyco/receipts/<date>/`, mirroring how the Novendor
   intelligence tasks write into `docs/`.
4. Keep the gates above. The scheduler must never be granted an auto-send path
   for email and must never be handed an invite code in plain text.
5. Track the scheduling work itself through the `azure-devops-intake` skill as a
   new Task under the HappyCo Feature before turning it on.

Until those steps are done, treat every task as a manual, on-demand run.

## Tracking

This cadence is documented under PR-4 / AB#396 (Feature 391, Epic 386). The
Novendor board uses Agile states New/Active/Resolved/Closed. Creating the real
recurring schedule is a separate, still-gated Task that is not part of PR-4.
