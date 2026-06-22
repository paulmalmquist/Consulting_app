## Mode: `plan-review`

Review the existing implementation plan in the "## Input" section. Do all three passes below, then produce a response with **exactly** the three output sections specified at the end. Do not skip passes. Do not add sections.

### Pass 1 — structural check
Confirm the plan has each of these. For every item that is missing, weak, or only implied, you will name it in the Critique.
- `## Context` — why this work, what prompted it, intended outcome.
- Environment classification — which Winston environment / owning surface.
- Shared-standard impact — portability, authoritative state, RLS, AI gateway, MCP.
- Scope boundaries — explicit in-scope / out-of-scope.
- Tickets or workstreams sized so each fits one coding session.
- Acceptance criteria per ticket. The canonical shape is Screen / API / DB / AI / Evals / Regression Guard. A plan that carries the *information* (exit codes, status enums, artifact lists, verification commands) but never marshals it into these rows still fails this check — say so.
- A verification section with concrete commands, not vague gestures.
- Critical file paths listed, and not hedged as "conditional" — either a file is in scope and named, or it is not.

### Pass 2 — Winston-fit check
- Does the plan respect the routing precedence in CLAUDE.md?
- Does it route through an existing skill/agent rather than inventing a new one?
- If it touches REPE financial reads, does it honor the authoritative-state lock (fail closed, `?audit_mode=1`)?
- If it creates tables, does it follow the database guardrails (RLS, `env_id`, `business_id`, `NNN_` schema files, `COMMENT ON TABLE`)?
- If it adds branding, prompts, copy, report wrappers, **or hardcoded absolute paths**, does it treat them as overridable / portable?
- Does scope creep beyond one bug/feature into incidental refactors?

### Pass 3 — risk surface
Flag anything that smells like:
- Hidden migrations or schema changes not called out.
- New env vars without a rotation/deploy plan.
- Cross-repo coupling (frontend + backend in one ticket without a contract).
- Tests that would pass even if the feature is broken.
- A determinism / idempotency claim that no test actually exercises.
- "Future-proofing" abstractions with no near-term caller.
- A missing regression guard — what existing behavior could this break, and does the plan say it must not?

---

## Required output — produce exactly these three sections

### Critique
A numbered list. For each issue: one sentence naming the gap, then one sentence proposing the fix. Cover all three passes. If a pass found nothing, write one line saying so. Do not pad.

### Refined ticket boundaries
If the plan is too large for one coding session, propose a split into 2–4 sized tickets, each named in the `NNNN-environment-short-title` format. If the plan is already correctly sized, write exactly: "Sized correctly — no split needed." and nothing more.

### Handoff prompt
Write a **complete, paste-ready** prompt for the target agent to execute the next ticket. Use the structure in the "## Implementation handoff scaffold" section of this bundle. This must be the actual prompt — not a description of what the prompt should contain, not a scaffold, not a checklist of sections. Imperative voice, concrete paths and commands, no filler.
