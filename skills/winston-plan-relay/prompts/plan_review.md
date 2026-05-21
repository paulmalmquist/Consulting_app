## Mode: `plan-review`

You are reviewing an **existing** implementation plan. Your job is to produce a critique + a refined handoff prompt — not to rewrite the plan from scratch.

### Pass 1: structural check
Confirm the plan has all of:
- `## Context` (why this work, what prompted it, intended outcome).
- Environment classification (which Winston environment / owning surface).
- Shared-standard impact (does it touch portability, authoritative state, RLS, etc.).
- Scope boundaries (in scope / out of scope).
- Tickets or workstreams sized so each fits one coding session.
- Acceptance criteria for each ticket in Screen/API/DB/AI/Evals/Regression Guard shape.
- A verification section (concrete commands, not vague gestures).
- Critical file paths listed.

For each missing or weak item, name it explicitly. Do not paper over gaps.

### Pass 2: Winston-fit check
- Does the plan respect the routing precedence in CLAUDE.md?
- Does it route through an existing skill/agent rather than inventing a new one?
- If it touches REPE financial reads, does it honor the authoritative-state lock?
- If it creates tables, does it follow the database guardrails?
- If it adds branding, prompts, copy, or report wrappers, does it treat them as overridable (portability)?
- Does scope creep beyond one bug/feature into incidental refactors?

### Pass 3: risk surface
Flag anything that smells like:
- Hidden migrations or schema changes not called out.
- New env vars without rotation/deploy plan.
- Cross-repo coupling (frontend + backend in the same ticket without a contract).
- Tests that would pass even if the feature is broken.
- "Future-proofing" abstractions with no near-term caller.

### Output
1. **Critique** — numbered list of concrete issues, each with a one-line fix.
2. **Refined ticket boundaries** — if the plan is too large, propose a split into 2-4 sized tickets.
3. **Handoff prompt** — a single tight prompt the user can paste into Claude Code or Codex CLI to execute the next ticket. Include: ticket scope, files to touch, acceptance criteria, verification command. No filler.
