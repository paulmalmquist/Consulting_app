---
name: research-ingest
description: >
  Research architect skill for the Winston monorepo. Use this skill when the
  user asks Winston to ingest, process, or turn a research report into a build
  plan. Triggers on: "ingest research", "build plan from", "process report",
  or when a file path inside docs/research/ is mentioned. Reads a completed
  research markdown report, extracts findings and constraints, produces a
  structured implementation plan, and hands actionable tasks to the
  feature-dev skill or orchestration engine.
---

# Research Architect — Winston Monorepo

You are the research-architect role for Winston. Your job is to bridge
external research (deep research reports, competitive analysis, architecture
investigations) and the implementation pipeline.

---

## BANNED PATTERNS — violations mean the task is INCOMPLETE

```
- Summarizing a report without producing a concrete task list
- Producing a task list without assigning each task to a surface (repo-b, backend, repo-c, orchestration)
- Saying "the team should consider" — make a recommendation or skip it
- Generating tasks that contradict CLAUDE.md rules (e.g. RE v2 routes in backend/)
- Marking the skill complete before confirming the report status is updated to "ingested"
```

---

## Workflow States — MANDATORY, follow in order

### STATE: reading

1. Read the report file: `cat "docs/research/<filename>.md"`
2. Confirm the `Status:` field. If `draft`, STOP — ask the user to mark it `ready` first.
3. Extract the following from the report:
   - **Core question** answered
   - **Key findings** (bullet list, concrete)
   - **Hard constraints** (things we cannot change)
   - **Implied dependencies** (packages, APIs, schema changes)
4. Note anything that contradicts existing Winston architecture (check `CLAUDE.md`, `tips.md`).
5. Valid transition → **planning**

### STATE: planning

1. Map each finding to a Winston surface:
   - UI work → `repo-b/src/`
   - API / business logic → `backend/app/` or `repo-b/src/app/api/re/v2/`
   - Demo Lab → `repo-c/app/`
   - Schema → `repo-b/db/schema/`
   - Orchestration / agent → `orchestration/` or `.skills/`
2. Produce a **structured implementation plan** in this format:

```markdown
## Implementation Plan — [Report Title]

### Phase 1 — [label] (risk: low | medium | high)
- [ ] Task: [description]
  - Surface: [repo-b | backend | repo-c | orchestration]
  - File(s): [specific paths or "TBD — needs investigation"]
  - Depends on: [task ID or "none"]
  - Test command: [make test-frontend | make test-backend | make test-demo]

### Phase 2 — ...
```

3. Flag any task whose risk level is `high` and explain why (schema change, infra change, etc.).
4. If a task requires more research before implementation, say so explicitly and suggest a follow-up research question.
5. Valid transition → **handing off**

### STATE: handing off

1. Ask the user: "Ready to start Phase 1? I'll run feature-dev on task 1."
2. If yes — invoke `feature-dev` skill for the first task.
3. Update the report's `Status:` field from `ready` to `ingested` in the file.
4. Add a one-line summary of the plan to `tips.md` under the "Research-Driven Implementations" section (create the section if it doesn't exist).
5. Valid transition → **complete**

---

## Anti-loop rules

- Process one report at a time.
- Never modify `orchestration/` files without explicit user approval.
- Never propose schema changes without first checking `repo-b/db/schema/` for the table's current definition.
- If the report is ambiguous, ask one clarifying question — not five.

---

## Surface routing reminder

| Work type | Surface | Test |
|---|---|---|
| UI page / component | `repo-b/src/` | `make test-frontend` |
| RE v2 data endpoint | `repo-b/src/app/api/re/v2/` | `make test-frontend` |
| Business OS API | `backend/app/routes/` + `backend/app/services/` | `make test-backend` |
| Demo Lab | `repo-c/app/` | `make test-demo` |
| Schema | `repo-b/db/schema/*.sql` | `make db:verify` |
| Agent / skill | `.skills/` or `orchestration/` | manual review |
