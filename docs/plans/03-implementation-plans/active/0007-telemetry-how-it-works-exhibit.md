# Telemetry "How This Works" architecture & evidence exhibit

- **ADO:** Story #654 (Active) under Feature #513 *RS Demo — Live Telemetry Streaming Slice + Dashboard System*, Epic #497 *E9 - Winston Prototype (Proof)*. Tasks #655–#660.
- **Branch:** `feat/telemetry-how-it-works` (off `origin/main`, isolated worktree `C:/Projects/ca-telemetry-howitworks`).
- **Status:** in progress.

## Problem / intent

Preparing the RS Telemetry environment for a Relativity Space *Director of Data & AI* interview. The strongest close is the running app proving its own claims, not a slide deck. There is no single in-app surface that explains how the environment works end to end (ingestion → medallion → governed serving → AI orchestration → model lifecycle → audit → delivery) and lets a skeptical reviewer click each claim to the live surface that backs it.

## Approach

Add a bottom-of-sidebar page `/lab/env/[envId]/telemetry/how-it-works` — an honest architecture & evidence exhibit — plus a companion interview-doc bundle. The governing constraint is honesty (RS checklist: *"a demo item is not done until its Verify block passes on production novendor.ai"*).

Every capability carries **two status axes**:
- **Implementation** — `built | partial | planned | blocked`.
- **Verification** — `prod_verified | stage_verified | code_verified | not_verified`.

v1 ships everything at `code_verified` (Partial AI rows at `not_verified`); rows are promoted to `prod_verified` only after the live novendor.ai route is clicked. Nothing claims production verification before that click. Planned/Blocked rows render "Not available — {reason}" with no link.

## Foundation decision

Built from `origin/main`, not the active `feat/hr-ml-algorithm-decision-lab` branch, which carries 83 uncommitted deletions removing the RUL Calibration screen and the ADE surface while `telemetryNav.ts` still lists "RUL Calibration" (a working-tree 404). On `origin/main` the telemetry env is intact, so RUL Calibration is honestly featured as Built with a deep-link.

## Scope (single PR)

**Deliverable A — in-app page (static typed config, surgical live links):**
- `repo-b/src/components/telemetry/howItWorksData.ts` — pure-data config (dual status, capabilities, MCP registry snapshot, medallion hops, governed-KPI chain (planned), orchestration steps, tool inventory, batch-vs-stream crosswalk, ML lifecycle, delivery timeline, known gaps).
- `repo-b/src/components/telemetry/HowItWorks.tsx` — client component + sub-components (`JumpNav`, `StatusTag`, `EvidenceLinks`, `DemoModeStrip` + KnownGaps, `FlowDiagram`, `McpRegistrySnapshot`, `FollowOneStreamAggregate` + greyed governed-KPI chain). Reuses `primitives.tsx` palette `C` and layout primitives.
- `repo-b/src/app/lab/env/[envId]/telemetry/how-it-works/page.tsx` — thin `async` wrapper forwarding `params.envId`.
- `repo-b/src/components/telemetry/telemetryNav.ts` — add group "Evidence & Architecture" (last) + `how-it-works` item.
- Tests: `howItWorksData.test.ts` (invariants, written first), `HowItWorks.test.tsx` (render), `repo-b/tests/telemetry-how-it-works.spec.ts` (Playwright smoke).

**Deliverable B — companion interview docs** under `docs/plans/telemetry-platform/`: `RS_DEMO_SCRIPT.md`, `RS_INTERVIEW_TALK_TRACK.md`, `RS_EVIDENCE_CHECKLIST.md`, `architecture-mermaid.md`.

## Acceptance

- Page loads at the route; "Evidence & Architecture → How This Works" at the bottom of the desktop rail and mobile drawer (not the 4-tab mobile bar).
- Built rows deep-link to real telemetry routes; Planned/Blocked rows show "Not available — reason" with no link.
- Dual-status pairs render; no row is `prod_verified` in v1.
- Real medallion table names (`tel_stream_readings_bronze`, `tel_stream_minute_agg`) render; MCP registry snapshot + KnownGaps render.
- `npm run typecheck`, `lint`, `test:unit`, `build` green; Playwright smoke green; desktop + mobile screenshots captured.
- No new dependencies; no migration; no backend route; no schema change.

## Honest caveats baked into the page

- Telemetry has no governed metric registry / lineage drawer / audit UI of its own — those are REPE-only. The governed-KPI chain is shown greyed as Planned with REPE named as the proof the pattern exists.
- Telemetry copilot grounding/citation depth is Partial — verify on the running app before quoting numbers.
- Cost is estimated, not enforced. Cross-platform Kafka→BigQuery→GKE spine is partial/disabled by default.
- No live "evidence coverage percentage" (would create a new accuracy burden) — the strip says "coverage not computed."

## Out of scope

No code beyond the page + config + tests + docs. No schema/migration, no backend route, no deploy, no production data mutation. Not restoring/committing the active branch's 83 deletions. No weakening of fail-closed/null_reason or auditability.
