---
name: meta-prompt
description: >
  Comprehensive pre-build and active-build harness that captures every concern Winston/Novendor
  developers worry about when implementing features, fixing bugs, or extending the platform.
  Produces a concern-aware build plan AND stays active as a guardrail harness during implementation.
  Use this skill before starting ANY non-trivial Winston work — feature builds, bug fixes, new
  surfaces, schema changes, prompt edits, write-tool additions, dashboard work, credit decisioning
  changes, PDS phases, or performance optimization. Also use when someone says "build this",
  "implement this", "add this feature", "fix this", or any task that touches multiple surfaces.
  If you're about to start writing code in the Winston repo and haven't loaded this skill, stop
  and load it first. This is the "did I think of everything?" checklist that prevents the
  regressions we've actually had.
---

# Meta Prompt: Winston Comprehensive Build Harness

This skill exists because Winston is a multi-surface platform where the most dangerous failures come not from writing bad code, but from **forgetting to account for something**. A dashboard that composes correctly but renders blank widgets. A mutation prompt that references tools not yet registered. A schema migration without seed alignment. A deployment without smoke tests.

Every section below represents a concern family that has caused real problems in this repo. The skill operates in two phases: **Plan** (before you write code) and **Harness** (while you write code).

---

## Phase 1: Plan — The Concern Scan

Before writing any code, walk through each concern family below. For each one, write a single sentence: either "Not applicable — [why]" or "Applicable — [what I need to do about it]." This produces a concern-aware build plan that catches problems before they become regressions.

### 1. Surface Ownership

Winston is not one app. It is a multi-surface platform with strict ownership boundaries.

**The question:** Which surface(s) does this task touch, and who owns them?

| Surface | Owner Agent | Repo Path | Test Command | Deploy Target |
|---|---|---|---|---|
| Shared Next.js UI | frontend | `repo-b/src/` (excluding lab/) | `make test-frontend` | Vercel |
| RE v2 data endpoints | frontend | `repo-b/src/app/api/re/v2/*` | `make test-frontend` | Vercel |
| Lab environments | lab-environment | `repo-b/src/app/lab/`, `repo-c/` | `make test-demo` | per tips.md |
| Business OS API | bos-domain | `backend/app/routes/`, `backend/app/services/` | `make test-backend` | Railway |
| AI gateway & copilot | ai-copilot | `backend/app/services/ai_gateway.py`, copilot components | `make test-backend` | Railway |
| MCP registry & tools | mcp | `backend/app/mcp/` | `make test-backend` | Railway |
| Schema & migrations | data | `repo-b/db/schema/*.sql`, `supabase/` | `make db:verify` | `make db:migrate` |
| Credit decisioning | credit-decisioning | `repo-b/src/app/lab/env/[envId]/credit/`, `backend/app/services/credit*.py` | `make test-backend` | Railway + Vercel |
| Excel add-in | lab-environment | `excel-addin/` | per tips.md | per tips.md |

**Rules:**
- If you touch files in multiple surfaces, name the primary write owner and coordinate with others. Do not let two agents edit the same surface.
- Map the repo path to its owning surface BEFORE proposing changes. `repo-b/src/app/lab/` is lab-environment, not frontend.
- If unsure which surface owns a file, check CLAUDE.md's owning-surface map.

### 2. Capability/Registry Alignment

This is the single most dangerous failure mode in Winston's history. The system prompt told the model it could create, update, and delete records. The write tools were never registered. Winston hallucinated success. Data became lies.

**The question:** Does this task add, modify, or reference any capability that the system prompt declares?

**Rules:**
- A capability declaration in the system prompt is only valid if the corresponding tool exists in the MCP registry. Check the registry before adding prompt language.
- Mutation rules in `_SYSTEM_PROMPT` must be injected conditionally — only when write tools are actually registered. Check `ai_gateway.py` `run_gateway_stream()`.
- If adding a new write tool: register it in the MCP registry FIRST, then add the system prompt language, then add the router pattern, then add the frontend confirmation UI. This order is non-negotiable.
- If a capability is referenced in the prompt but the tool doesn't exist yet, suppress the prompt block. Do not ship "aspirational" capability declarations.

**Validation:** Can you point to the registered tool for every capability the system prompt claims? If not, the build is incomplete.

### 3. Write/Mutation Safety

Every write operation in Winston follows a two-phase confirmation flow enforced at the tool layer, not just the prompt layer.

**The question:** Does this task involve creating, updating, or deleting any data?

**Rules:**
- Write tools must accept a `confirmed: bool = False` parameter. If `confirmed=False`, the tool returns `pending_confirmation` (not an error). The frontend renders a confirmation modal. The user clicks "Confirm" to re-send with `confirmed=True`.
- `_WRITE_RE` (the regex that routes queries to the write lane) must be tight. It requires an explicit creation verb directly preceding a noun. Exclude comparative/analytical framing: "compare", "show", "analyze", "what's new" are NOT write intents.
- The debug drawer (AdvancedDrawer) must visually distinguish write-related tool events — different color/badge for write permission tools, "Pending Confirmation" state shown inline.
- Graceful degradation: if a write tool is unavailable at runtime, Winston must explain "write operations are currently unavailable" instead of attempting and failing silently.
- The system prompt must include explicit error recovery instructions for tool failures. The model must NEVER invent results when a tool returns nothing.

**Validation:** If this task adds a write path, trace it end-to-end: system prompt → router pattern → MCP registry → tool implementation → confirmation gate → frontend modal → debug drawer visibility.

### 4. Schema, Seed & Migration Coherence

Schema changes are never isolated. They ripple through migrations, seeds, API responses, and UI rendering.

**The question:** Does this task change, add, or depend on database tables or columns?

**Rules:**
- Check `repo-b/db/schema/` and `supabase/` before proposing schema changes. Know what exists.
- A schema change is incomplete without: migration file, seed alignment, API response updates, and UI rendering updates. Partial schema changes = broken bridges.
- Use canonical column names from tips.md. Do NOT use legacy aliases (`call_id` → use `fin_capital_call_id`; `fund_id` → use `fin_fund_id`).
- Object model bridging: REPE and finance engine are separate identity systems. Bridge via `fin_fund.fund_code = repe_fund.fund_id::text` and `fin_participant.external_key = re_partner.partner_id::text`.
- State machines (model status, capital-call lifecycle, distribution lifecycle) must be enforced at the API layer, not just the UI. Return HTTP 409 when a locked record is modified.
- Empty data in the UI means missing seed/context, not a UI bug. Verify data hydration, not just structural rendering.

**Validation:** If this task changes schema, can you show: the migration SQL, the seed that populates it, the API endpoint that serves it, and the UI component that renders it?

### 5. Dashboard Composition & Data Hydration

Dashboards that compose correctly but render blank widgets are still broken.

**The question:** Does this task affect dashboard rendering, widget composition, or data hydration?

**Rules:**
- Keep intent parsing, composition, validation, and entity hydration as four separate concerns. Do not conflate them.
- Prefer additive migration paths over deleting older fallback flows until the new prompt-to-spec coverage is proven.
- Test both structure AND data: a spec that composes correctly but hydrates blank widgets is incomplete.
- If a corrective prompt exists for a dashboard behavior, trust the corrective prompt over the original aspirational prompt. Load the newest corrective version first.
- Entity resolution: `entity_ids` disappearing is a data hydration bug, not a composition bug. Trace the data path, not the layout logic.

**Validation:** Can you render at least one dashboard with hydrated widget data (not placeholder structure alone)?

### 6. Chat Workspace & Response Blocks

Chat is not UX-only work. It requires data hydration, session state, and block-type contracts.

**The question:** Does this task affect the chat workspace, response rendering, or analytical follow-up behavior?

**Rules:**
- Keep work split into four tracks: workspace shell, response blocks, analytical intent/state, and seed/data fixes. Treat all four as first-class.
- Preserve the existing command bar path while adding full-screen route. Chat work is additive, not a rewrite.
- Any backend change must map to a visible chat behavior change. "Cleaner abstraction" without visible improvement is not a valid justification.
- Name the missing contracts explicitly: block types, session fields, renderers, seed gaps. Generic "build chat" requests fail because they don't identify what's actually missing.

**Validation:** Can you show one chat path that streams text plus a structured block, and one follow-up transform that uses prior result state?

### 7. AI Architecture & Path Clarity

Winston has multiple overlapping AI systems sharing branding but not implementation. Do not flatten them into one runtime.

**The question:** Which AI path does this task affect?

**Named paths:**
- Production copilot (gateway routing + RAG + tool-calling)
- Document indexing/RAG pipeline
- Demo-lab chat
- Public assistant
- Developer orchestration

**Rules:**
- Start by naming which AI path is in scope. Different paths have different tables, different routing, different prompts.
- Use canonical tables: `rag_chunks`, not older demo knowledge-base tables.
- Keep request routing, retrieval, tool execution, conversation persistence, and UI rendering as separate contracts. A change in one does not automatically propagate to others.

### 8. Performance & Latency

Optimization without measurement is guesswork.

**The question:** Does this task affect response latency, model routing, RAG quality, or prompt budgets?

**Rules:**
- Performance work must be attached to a real request flow: routing → RAG decision → model call → tool execution → trace assembly → UI hydration.
- Any proposed optimization needs a measurement path. "This should be faster" is not acceptable. "This reduces p50 latency on Lane A from 1200ms to 800ms, measured by [method]" is.
- Preserve lane-specific intent: the correct model and retrieval budget per lane matters more than raw speed.
- Split performance, retrieval quality, and UX acknowledgment timing into separate concerns. Do not blend them.

**Performance benchmarks (fail if exceeded):**
- Initial page load (LCP): >3000ms
- API `/api/re/v2/funds`: >800ms
- API `/api/pds/v1/command-center`: >1200ms
- Winston first SSE event: >2000ms
- Winston full response: >8000ms

### 9. Credit Decisioning (Deny-by-Default)

The most heavily guardrailed surface in the repo. Every violation is treated as incomplete.

**The question:** Does this task touch consumer credit decisioning, underwriting, or the credit environment?

**Rules (Three-Layer Architecture):**

**Layer 1 — Walled Garden:** The AI may only reference documents ingested into the environment's approved corpus. No internet sources, no training knowledge, no "best guesses." Every claim traces to a (document_id, passage_id, text_excerpt) tuple. If evidence is insufficient, return `INSUFFICIENT_EVIDENCE` with an escalation recommendation.

**Layer 2 — Chain-of-Thought:** Every query processes through: DECOMPOSE → RETRIEVE → VALIDATE → SYNTHESIZE → AUDIT. No jumping to conclusions. Each step takes the time it requires (800ms–2000ms is expected). This latency IS the compliance work.

**Layer 3 — Format Locks:** Every output must conform to declared schema for its target (HUMAN_READER, DECISIONING_ENGINE, SERVICING_PLATFORM, ADVERSE_ACTION, etc.). Validate before delivery. If validation fails after 2 retries, REJECT and escalate.

**Examiner Test:** If a regulator asked "how did the system arrive at this output?", can you show: (1) the exact documents referenced, (2) the step-by-step reasoning, (3) the schema-valid output? If any answer is "no", the task is incomplete.

### 10. PDS Delivery Sequencing

PDS is a staged program with dependency-driven execution order, not a greenfield build.

**The question:** Does this task involve PDS platform features, executive analytics, or construction/development surfaces?

**Rules:**
- Follow the dependency graph. Do not jump to later phases while earlier prerequisites are hypothetical.
- Split platform work, executive automation, and AI-query work into explicit phases with their own verification.
- Reuse Winston infrastructure where source docs say to reuse. Do not fork a parallel PDS stack without cause.
- Do not start with the most ambitious analytics prompt before schema, data, and baseline dashboards exist.

### 11. Prompt & Behavior Coherence

System prompts, router patterns, and tool registries must stay in sync. A prompt that references a capability the router doesn't handle, or a router that handles a pattern the tools don't support, creates the conditions for hallucination.

**The question:** Does this task change system prompts, router patterns, or tool registration?

**Rules:**
- System prompt mutation rules must be conditionally injected based on registry state. Check at prompt-build time.
- Router patterns must be validated against the registry at startup. If `_WRITE_RE` matches, the corresponding write tools must exist.
- Prompt changes must come with verification notes so QA can test the full assistant behavior path.
- If the system prompt has contradictory instructions (e.g., "call with EMPTY params" AND "ALWAYS confirm params first"), resolve the contradiction before shipping.

### 12. Deployment Ceremony

Deploy is not "just push." It is a ceremony with mandatory checkpoints.

**The question:** Will this task result in a deployment?

**Mandatory sequence:**
1. Inspect git status and branch
2. Run local checks for affected surfaces (`make test-backend`, `make test-frontend`, etc.)
3. `git add <specific files>` — never `git add -A`
4. `git commit` with conventional message format
5. `git push` to `origin/main`
6. Monitor GitHub Actions CI
7. Monitor Railway (backend) and/or Vercel (frontend) deployment
8. Run `make db:migrate && make db:verify` if schema changed
9. Smoke test: curl deployed endpoint, paste actual response with HTTP status
10. Browser verification: navigate to paulmalmquist.com, trigger feature, confirm behavior

**Stop immediately on:** git conflicts, failing tests, failed CI, failed deploy, failed smoke test. Report the failure; do not proceed.

### 13. Security & Auditability

SOC 2 MVP controls are not optional.

**The question:** Does this task affect audit trails, access controls, state machines, or approval workflows?

**Rules:**
- High-risk actions must emit immutable events to `app.event_log`.
- State transitions on critical workflow objects must be validated (not just UI-enforced).
- Segregation of duties: creator ≠ approver on approval paths. Enforce in the service layer.
- Journal objects: soft-delete + versioning. Posted state is immutable.
- Configuration changes (roles, workflows, thresholds) must be logged.

### 14. Visualization & UI Conventions

Consistent visualization patterns prevent executives from losing context.

**The question:** Does this task add or modify charts, tables, or data displays?

**Key conventions from tips.md:**
- Radial charts: max 4 rings, labels outside, 3 operational signal colors (blue/amber/red), everything else gray
- Deal size: discrete tiers (<$50M, $50–150M, >$150M), not continuous scaling
- Financial cards: `tabular-nums`, inline variance color coding, compact `rounded-xl p-3`
- Tables: `PdsRiskBadge` for risk encoding (critical/high/moderate/low), default sort by risk descending
- Spacing: `space-y-3` between sections, `text-base font-semibold` section headers
- Dark theme consistency: no white flash on load, KPI chips don't wrap at 1440px, no horizontal scroll at 390px mobile

---

## Phase 2: Harness — Active Build Guardrails

Once the plan is complete, these rules stay active during implementation. They cannot be skipped.

### Mandatory Feature-Dev States

Every implementation traverses these states in order. Terminal output from TESTING and VERIFYING is required.

**ORIENTING**
- Read CLAUDE.md, confirm which surface owns this feature
- State: "I will modify files ONLY in `<service>/`"
- Run baseline tests BEFORE writing anything. If baseline is red: STOP. Report. Do not proceed.

**IMPLEMENTING**
- Write minimal code changes to actual files (not pseudocode blocks)
- Follow existing patterns in adjacent files — do not invent new conventions
- One deliverable at a time. After each: STOP. Verify. Proceed.

**TESTING**
- Run `make test-{service}` — paste FULL last 30 lines of output
- If tests fail: read error → fix → return to IMPLEMENTING
- Exit code 0 AND actual terminal output required. Described results are not acceptable.

**DEPLOYING**
- `git add <specific files>` (never `-A`)
- Conventional commit message
- Deploy to correct target (Vercel for frontend, Railway for backend)
- Run DB migrations if schema changed

**VERIFYING**
- Curl deployed endpoint with actual response pasted
- Browser navigation to paulmalmquist.com confirming feature works
- Screenshot of live behavior

### Banned Patterns

These patterns are explicitly prohibited. If you catch yourself doing any of them, stop and correct.

```
- Writing a code block without executing it when you have shell access
- Saying "the tests should pass" without running them
- Describing a deployment without running the deploy command
- Using "would", "could", or "should" in completion statements
- Showing terminal commands without executing them
- Saying "done" without a smoke test HTTP status code
- Claiming completion without all checklist items checked
- Refactoring to "make it cleaner" beyond what the task requires
- Fixing unrelated warnings or failures
- "Keep going" after reaching completion state
- Inventing results when a tool returns nothing
- Using similarity scores as proof (similarity ≠ evidence)
- Summarizing a report without producing a concrete task list
- Saying "the team should consider" — make a recommendation or skip it
```

### API Pattern Detection

When wiring frontend to backend, identify which pattern applies:

| Pattern | Call Method | Backend | Port |
|---|---|---|---|
| A — BOS FastAPI | `bosFetch()` | FastAPI backend | 8000 |
| B — Next Route Handler | Direct fetch `/api/re/v2/*` | Next.js route handler, NO FastAPI | — |
| C — Demo Lab | `apiFetch()` | Demo Lab backend | 8001 |

Do not mix patterns. If the existing page uses `bosFetch()`, new endpoints for that page use `bosFetch()`.

### Auto-Recalc Pattern

For any calculation-heavy UI (financial models, scenario analysis):
- State machine: `idle → dirty → recalculating → idle`
- Debounce: 600ms before `dirty → recalculating`
- Queue exactly one re-run if new trigger fires during recalc (`needsRerunRef`)
- Preserve last successful result during recalc at `opacity-60` with spinner overlay
- Input hash idempotency: hash sorted asset IDs + override key-values, check for cached run

### Completion Checklist

Before declaring any task complete, verify:

```
[ ] Concern scan completed (Phase 1) — every concern family addressed or marked N/A
[ ] Surface ownership confirmed — files only in declared service directory
[ ] Baseline tests passed BEFORE implementation began
[ ] Code written to actual files (not pseudocode)
[ ] `make test-{service}` passes — terminal output included
[ ] Deploy command executed — output included
[ ] Smoke test returns expected HTTP status — output included
[ ] Browser screenshot confirms feature visible (if UI change)
[ ] No capability declared in prompts without corresponding registered tool
[ ] No write path without two-phase confirmation flow
[ ] No schema change without migration + seed + API + UI alignment
[ ] Debug drawer visibility confirmed for any new tool interactions
[ ] Security: audit events emitted for state-changing actions (if applicable)
```

---

## When to Load Supporting Skills

This skill is the orchestrator. For deep-dive execution within specific concern families, load the specialized skill:

| Concern Family | Load |
|---|---|
| Dashboard blank widgets, composition logic | `skills/winston-dashboard-composition/SKILL.md` |
| Chat workspace, response blocks | `skills/winston-chat-workspace/SKILL.md` |
| Write tools, mutation UX, confirmation gates | `skills/winston-agentic-build/SKILL.md` |
| Credit decisioning, walled garden | `.skills/credit-decisioning/SKILL.md` |
| PDS delivery phases | `skills/winston-pds-delivery/SKILL.md` |
| Latency, model routing, RAG quality | `skills/winston-performance-architecture/SKILL.md` |
| Post-mortem, regression recovery | `skills/winston-remediation-playbook/SKILL.md` |
| Schema, migrations, ETL | `agents/data.md` |
| MCP tool contracts, permissions | `agents/mcp.md` |
| Deployment ceremony | `agents/deploy.md` |
| Construction/development bridge | `skills/winston-development-bridge/SKILL.md` |
| Document ingestion pipeline | `skills/winston-document-pipeline/SKILL.md` |

Load the meta-prompt first for the concern scan, then load the relevant specialized skill for execution.

---

## Historical Context: Why This Exists

This skill was born from real failures:

- **The "Lost the Plot" Incident:** System prompt declared write capabilities. Tools were never registered. Winston hallucinated creating records. Users believed data existed. It didn't.
- **Blank Widget Dashboards:** Composition logic worked perfectly. Entity resolution silently failed. Dashboards looked complete but showed nothing.
- **Schema Without Seeds:** New columns added via migration. No seed data populated. Every new environment started with blank screens.
- **Aspirational Prompts:** Prompts described what Winston *would* do. Nothing was actually implemented behind them. The gap between declaration and reality widened until the system was unreliable.
- **Broad "Fix Everything" Attempts:** Remediation prompts that tried to fix all failures at once required repeated corrections. Bounded workstreams with explicit verification succeeded.
- **Deploy Without Verification:** Code pushed, CI passed, but nobody curled the endpoint or checked the live site. Regressions shipped silently.
- **Pattern Over-Matching:** "What's new in this fund?" routed to the write/mutation lane instead of a read query. The model offered to create a fund when the user just wanted a summary.

Each concern family in this skill maps to at least one of these real failures. The goal is not bureaucratic process — it's preventing the specific ways this codebase has broken before.
