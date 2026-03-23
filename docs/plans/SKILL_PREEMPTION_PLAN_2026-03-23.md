# Skill Preemption Plan — 2026-03-23

## Goal

Use the existing markdown corpus to harden the real skills already on disk so Winston can anticipate your most common request patterns with less manual steering, less prompt drift, and fewer routing misses.

## What The Markdown Corpus Says

The repo's markdown is not just documentation. It is a mixed command surface, planning layer, memory system, ops dashboard, and prompt archive.

High-signal observations from the scan:

- The dominant markdown themes are `build`, `test`, `report`, `feature`, `status`, `agent`, `demo`, `prompt`, `dashboard`, `fix`, `plan`, and `audit`.
- The heaviest directory clusters are `docs/competitor-research/`, `memory/`, `agents/`, `docs/ops-reports/`, `docs/feature-radar/`, `docs/plans/`, and the demo/dashboard prompt surfaces.
- Your request style repeatedly mixes product direction, prompt-driven feature delivery, production verification, and operational routing in the same corpus.

Representative evidence:

- `memory/2026-03-12-dashboard-dive.md` shows large end-to-end feature sprint requests with architect/builder/QA splits, streaming AI, dashboards, document intelligence, and full-pipeline verification.
- `memory/2026-03-12-request-timed-out-before-a-res.md` shows explicit browser-based live-site verification requests with step-by-step screenshots and UI reporting.
- `memory/2026-03-12-winston-claude.md` shows repeated harness/routing/session-control requests.
- `META_PROMPT_CHAT_WORKSPACE.md`, `docs/WINSTON_AGENTIC_PROMPT.md`, `docs/plans/DEMO_FEATURES_META_PROMPTS.md`, and `PDS_META_PROMPTS.md` show that you often work by giving a structured prompt brief and expecting feature delivery from it.
- `docs/LATEST.md`, `docs/ops-reports/digests/winston-daily-brief-2026-03-23.md`, and `tips.md` show that you expect the system to preload current repo state, active bugs, and deployment context before work starts.
- `docs/feature-radar/context-aware-delegation.md` and the market/MSA skill docs show a recurring pattern of research producing concrete build directives.

## Recurring Request Archetypes

These are the request types the current skill system should pre-handle:

1. Prompt-to-feature delivery
- You often provide a long-form build brief and expect it to become a real implementation plan or code path without re-explaining the repo.
- Source examples: `memory/2026-03-12-dashboard-dive.md`, `docs/plans/DEMO_FEATURES_META_PROMPTS.md`, `PDS_META_PROMPTS.md`.

2. Production bug triage and regression cleanup
- You repeatedly focus on visible defects, live regressions, and exact verification criteria.
- Source examples: `META_PROMPT_CHAT_WORKSPACE.md`, `docs/ops-reports/coding-sessions/2026-03-22-plan.md`, `docs/ai-testing/2026-03-22.md`, `docs/LATEST.md`.

3. Browser/live-site verification
- You ask for real user-path validation, screenshots, and report-style findings.
- Source examples: `memory/2026-03-12-request-timed-out-before-a-res.md`, `tips.md`, `docs/CRE_INTELLIGENCE_BROWSER_TEST.md`.

4. Research-to-build planning
- You use markdown research, audits, and intelligence outputs as upstream inputs to implementation work.
- Source examples: `RESEARCH.md`, `docs/research/*`, `docs/feature-radar/*`, `docs/competitor-research/*`.

5. Daily operational awareness before coding
- You expect awareness of active bugs, degraded environments, deployment state, and priority work before implementation starts.
- Source examples: `docs/LATEST.md`, `docs/ops-reports/digests/*`, `tips.md`.

6. Harness, routing, and session control
- You explicitly ask for Claude/Codex harness behavior, repo-root confirmation, browser/tool expectations, and persistent-session behavior.
- Source examples: `memory/2026-03-12-winston-claude.md`, `CLAUDE.md`, `AGENTS.md`.

7. Autonomous intelligence -> feature backlog conversion
- You want market/MSA research loops to produce concrete prompts, feature cards, and implementation-ready follow-on work.
- Source examples: `skills/market-rotation-engine/SKILL.md`, `skills/msa-rotation-engine/SKILL.md`, `docs/market-features/`, `docs/msa-features/`.

## Skill Reality Check

The documented router and the actual filesystem are currently out of sync.

Skills that actually exist on disk:

- `.skills/feature-dev/SKILL.md`
- `.skills/research-ingest/SKILL.md`
- `.skills/credit-decisioning/SKILL.md`
- `skills/market-rotation-engine/SKILL.md`
- `skills/msa-rotation-engine/SKILL.md`

Skills referenced by `CLAUDE.md` and `docs/instruction-index.md` but missing on disk include:

- `skills/winston-router/SKILL.md`
- `skills/winston-session-bootstrap/SKILL.md`
- `skills/winston-chat-workspace/SKILL.md`
- `skills/winston-dashboard-composition/SKILL.md`
- `skills/winston-agentic-build/SKILL.md`
- `skills/winston-remediation-playbook/SKILL.md`
- `skills/winston-prompt-normalization/SKILL.md`
- `skills/winston-document-pipeline/SKILL.md`
- `skills/winston-performance-architecture/SKILL.md`
- `skills/winston-pds-delivery/SKILL.md`
- and several others

That mismatch is the first thing to correct conceptually. Until those skill files exist, the preemptive behavior has to land in the real skills above, not the aspirational ones.

## Plan By Existing Skill

### 1. Harden `feature-dev` into the default feature-delivery absorber

`feature-dev` should become the main preemptive receiver for most of your recurring asks until the specialized Winston skills actually exist.

Planned upgrades:

- Add a request-archetype intake section at the top of the skill:
  - prompt-to-feature
  - bugfix/regression
  - browser/live verification follow-up
  - build-from-meta-prompt
  - continue/resume after timeout
  - audit/remediation

- Add a mandatory context preload matrix:
  - always read `tips.md`
  - always read `docs/LATEST.md`
  - if AI/chat/dashboards are involved, read latest `docs/ai-testing/*` and the relevant prompt doc
  - if new feature suggestion work is involved, read `docs/CAPABILITY_INVENTORY.md` and latest `docs/feature-radar/*`
  - if deploy/prod issues are involved, read latest `docs/ops-reports/deploy/*` and site-health report

- Add a "prompt reference mode":
  - if the user names a meta prompt or prompt doc, the skill should convert it into a concrete execution brief automatically
  - do not wait for the user to restate the scope in coding terms

- Add a "resume after interruption" protocol:
  - inspect `memory/`
  - inspect current git status
  - inspect the most recent relevant ops/coding-session report
  - reconstruct the last clear unfinished deliverable before asking the user to restate work

- Add a "verification branch" for non-edit requests:
  - if the request is browser/live-site validation rather than code changes, do not force deploy-oriented completion criteria
  - produce a structured test report instead

- Add a repeat-problem checklist:
  - runtime ownership confusion
  - direct-DB vs BOS API confusion
  - missing env/business scope
  - live bug reproduced but not linked to latest ops report
  - prompt asks for a feature that already exists

### 2. Expand `research-ingest` from report ingestion to corpus-to-skill planning

`research-ingest` is the best existing place to absorb your "scan markdown and turn it into a plan" style requests.

Planned upgrades:

- Broaden the intake beyond `docs/research/*` so it can also process:
  - prompt collections
  - memory/session summaries
  - ops reports
  - feature radar and competitor research bundles

- Add a new output mode: `skill-hardening plan`
  - summarize recurring request archetypes
  - map each archetype to an existing skill
  - identify preemptive defaults that should be added to that skill
  - identify missing specialized skills that should remain deferred until the core skills are stronger

- Add a "source bundle" format in the output:
  - source docs scanned
  - themes extracted
  - target skill
  - recommended skill edits
  - expected verification impact

- Add a "tips.md memory hook":
  - when a new durable recurring pattern is discovered, append a short operational memory line to `tips.md`

### 3. Keep `credit-decisioning` specialized, but export its guardrail patterns

`credit-decisioning` is not the main home for most of your requests, but it contains the repo's strongest guardrail design.

Planned upgrades:

- Preserve the skill as a domain-specific underwriting workflow
- Reuse its strongest patterns elsewhere through reference snippets:
  - deny-by-default when evidence is missing
  - structured refusal instead of hand-wavy fallback
  - citation-chain discipline for high-stakes AI outputs
  - format-lock enforcement for downstream machine-consumed outputs
  - explicit audit records for write/decision flows

Where to reuse those patterns first:

- document intelligence builds
- LP letter/report drafting
- agentic write tools
- governance/audit surfaces
- any AI flow that mutates data or drafts an externally shared artifact

### 4. Standardize `market-rotation-engine` handoff output

This skill already produces research, gaps, and feature prompts. The next step is to make its output immediately consumable by `feature-dev`.

Planned upgrades:

- Require every generated feature card or prompt to include:
  - owning surface
  - explicit downstream skill
  - concrete files likely to change
  - verification commands
  - cross-vertical implications
  - capability-duplication check against `docs/CAPABILITY_INVENTORY.md`

- Add a "build-ready vs research-only" distinction so feature delivery only picks up cards that have enough implementation detail

- Add a "top three next builds" summary block so daily digests can hand coding sessions a short, ranked queue

### 5. Standardize `msa-rotation-engine` handoff output

The MSA skill already treats research as a feature generator. It should adopt the same delivery contract as market rotation.

Planned upgrades:

- Align its feature-card schema with market rotation
- Ensure every prompted card names:
  - owning runtime
  - schema impact
  - route/page impact
  - test plan
  - proof-of-execution requirements

- Add direct handoff language for `feature-dev` so a coding session can pick up a prompted card without manual reinterpretation

## Router Alignment Plan

Before creating any new specialized Winston skills, tighten the router around the real skills that exist.

Phase 0 changes:

1. Update `CLAUDE.md` and `docs/instruction-index.md` to mark missing skills as planned or reference-only.
2. Route missing-skill intents to the closest existing real skill plus the matching prompt doc as reference.
3. Do not let the router imply that a missing skill file is executable today.

Recommended temporary routing until the missing skills exist:

- chat workspace, dashboard composition, remediation, prompt normalization, document pipeline, performance architecture, PDS delivery, sales intelligence, demo generation, session bootstrap, router:
  - route to `feature-dev` or `research-ingest` first
  - load the relevant prompt/reference doc second

## Execution Order

### Phase 1 — Stabilize the existing skill backbone

Edit first:

- `.skills/feature-dev/SKILL.md`
- `.skills/research-ingest/SKILL.md`
- `CLAUDE.md`
- `docs/instruction-index.md`

Outcome:

- the router points to real files
- the two most general skills can absorb most of your current request volume

### Phase 2 — Import guardrails and preflight behavior

Edit next:

- `.skills/credit-decisioning/SKILL.md`
- `.skills/feature-dev/SKILL.md`
- `tips.md`

Outcome:

- higher-quality defaults for AI-heavy and high-stakes build requests
- fewer "best guess" implementations

### Phase 3 — Improve autonomous feature handoffs

Edit next:

- `skills/market-rotation-engine/SKILL.md`
- `skills/msa-rotation-engine/SKILL.md`

Outcome:

- research loops produce prompts and feature cards that are easier to ship without translation overhead

### Phase 4 — Split back into specialized skills only after the backbone works

Only after Phases 1-3:

- create or restore the missing Winston skills one by one
- split logic out of `feature-dev` only when the trigger patterns are stable enough to justify their own file

## Recommended Success Criteria

The plan is working when all of these are true:

- A prompt-heavy feature request can be handled by an existing skill without the user re-explaining the repo.
- A browser/live verification request no longer falls into an implementation-only workflow.
- A "continue where you left off" request can reconstruct context from repo markdown and memory before asking for help.
- Research, ops reports, and feature radar outputs feed directly into execution plans.
- The router never points to a skill file that does not exist.
- Autonomous market/MSA outputs arrive already shaped for feature delivery.

## Recommendation

Do not start by creating ten new skills.

Start by making `feature-dev` and `research-ingest` much smarter, align the router to the files that actually exist, and only then split out specialized Winston skills where the request volume proves they deserve their own surface.
