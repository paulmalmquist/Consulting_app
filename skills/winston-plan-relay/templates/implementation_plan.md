# Dispatch Record <NNNN> — <Title>

**Created:** YYYY-MM-DD
**Status:** Active
**Environment:** <env>
**Deliverable type:** <Skill | Feature | Refactor | Data | AI | Infra>

## Raw Idea / Context
<verbatim or near-verbatim from the input, plus why this matters now>

## Step 1 — Environment Classification
<which Winston environment owns this, and why>

## Step 2 — Shared Standard Impact
<list any shared standards this touches: portability, authoritative state, RLS, AI gateway, MCP, etc., and how the plan honors each>

## Step 3 — Deliverable Type
<one paragraph: what shape the work takes>

## Product intent
<what the user can do after this ships that they couldn't before>

## Domain model
<entities, relationships, contracts touched; reference existing tables/services by path>

## Tickets / Workstreams

### Ticket 1 — <short title>
- **Scope:** <one paragraph>
- **Files to touch:**
  - `path/to/file` — create | modify
- **Acceptance criteria:**
  - **Screen:** <what the user sees>
  - **API:** <endpoints, payloads>
  - **DB:** <tables, RLS, tenant scope>
  - **AI:** <prompts, retrieval, evals> (omit if N/A)
  - **Evals:** <automated checks>
  - **Regression Guard:** <what must not break>
- **Constraints:** <RLS, authoritative-state, portability, etc.>
- **Verification:** <exact shell commands>
- **Out of scope:** <bulleted list>

### Ticket 2 — …

## Verification (end-to-end)
<how to prove the whole thing works after all tickets land>

## Critical files
- `path` — <one line>
