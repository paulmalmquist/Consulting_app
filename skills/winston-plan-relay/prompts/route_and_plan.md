## Mode: `route-and-plan`

You are converting a **rough idea** into a Winston implementation plan. The input is not yet a plan — it may be a pasted thought, a meeting note, or a half-formed feature request.

### Step 1 — Route
Run the dispatch algorithm from CLAUDE.md against the input:
1. Extract any explicit command, harness, agent, skill, or file path the user named.
2. Map any repo paths to the owning surface (see CLAUDE.md "Owning-Surface Map").
3. Score candidate entrypoints by trigger match, surface ownership, and intent overlap.
4. Pick **one** primary owning surface and up to two supporting docs from its `handoff_to`.

State your routing decision explicitly: "Primary: `<path>`. Supporting: `<paths>`. Why: `<one sentence>`."

If the request spans surfaces and no dominant intent wins, **stop and ask one clarifying question** instead of guessing.

### Step 2 — Classify environment
Pick from the existing Winston environments (see `docs/plans/03-implementation-plans/active/` for the working set) or name a new one. Environment classification drives the plan filename.

### Step 3 — Shared-standard impact
Check whether the idea touches:
- Portability layers (platform core / environment package / client config).
- Authoritative-state lock (any REPE financial read).
- Database guardrails (any new table, column, or migration).
- AI gateway / prompt policy.
- MCP registry.

For each that's touched, name the constraint and how the plan will honor it.

### Step 4 — Draft the plan
Use this skeleton (matches `docs/plans/_templates/` and the existing active plans):

```markdown
# Dispatch Record <NNNN> — <Title>
**Created:** YYYY-MM-DD
**Status:** Active
**Environment:** <env>
**Deliverable type:** <type>

## Raw Idea / Context
<verbatim or near-verbatim from the input, plus why this matters>

## Step 1 — Environment Classification
## Step 2 — Shared Standard Impact
## Step 3 — Deliverable Type

## Product intent
## Domain model
## Tickets / Workstreams
  ### Ticket 1 — <short title>
    Scope, files, acceptance criteria (Screen/API/DB/AI/Evals/Regression Guard), verification.
  ### Ticket 2 — …

## Verification
## Critical files
```

The relay has already suggested a filename number — use it.

### Step 5 — Handoff
End with a Claude Code / Codex prompt that implements **only Ticket 1**. Do not bundle later tickets into the same prompt.

### Output
1. **Routing decision.**
2. **Drafted plan** in the skeleton above.
3. **Ticket 1 handoff prompt.**
