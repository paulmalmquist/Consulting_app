# Idea Dispatch Record

**Date:** YYYY-MM-DD  
**Source:** [Conversation / session discovery / test failure / sales call / observation]  
**Status:** Dispatched / In progress / Done / Parked

---

## Raw idea

> Paste the idea, request, bug report, or observation exactly as stated.

---

## Classification

### Environment(s) affected
- [ ] Control Tower
- [ ] Novendor CRM / Accounting
- [ ] Meridian REPE
- [ ] Stone PDS
- [ ] Supply Chain / Databricks
- [ ] Winston Legal
- [ ] History Rhymes
- [ ] Senior Housing
- [ ] Demo Lab
- [ ] Excel Add-in
- [ ] MCP / Orchestration / AI Runtime
- [ ] Marketing
- [ ] Platform-wide / shared

### Shared design system impact?
- [ ] Tokens (color, spacing, typography)
- [ ] Shell / navigation
- [ ] Cards / tables / drawers / charts
- [ ] Environment theming
- [ ] Dark/light mode
- [ ] None

### AI runtime impact?
- [ ] Gateway behavior
- [ ] SSE event lifecycle or streaming
- [ ] Fail-closed / null return / refusal
- [ ] Prompt or instruction change
- [ ] MCP tool, confirmation gate, or receipt
- [ ] None

### Data / schema impact?
- [ ] New table or column needed
- [ ] Migration needed
- [ ] RLS change needed
- [ ] None

### Deployment impact?
- [ ] Vercel deploy needed
- [ ] Railway restart needed
- [ ] Env var change needed
- [ ] None

---

## Deliverable type
- [ ] Code change
- [ ] Research / spike
- [ ] Migration
- [ ] UI verification
- [ ] Eval / test addition
- [ ] Design system update
- [ ] Documentation only

---

## Route

**Primary plan folder:** `docs/plans/[environment]/`  
**Secondary folders:**  
- `docs/plans/01-shared-standards/[area]/`
- (add others)

---

## Required reading before coding

- [ ] `CLAUDE.md`
- [ ] `docs/plans/[environment]/architecture.md`
- [ ] `docs/plans/[environment]/backlog.md`
- [ ] `docs/plans/[environment]/ai-behavior.md` (if AI impact)
- [ ] `docs/plans/01-shared-standards/design-system/design-system-charter.md` (if design impact)
- [ ] `docs/plans/01-shared-standards/ai-runtime/ai-runtime-charter.md` (if AI impact)
- [ ] `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` (if REPE financial reads)
- [ ] (add others)

---

## Implementation plan

1. (step with file path)
2. (step with file path)
3. (step with file path)

---

## Acceptance criteria

### On screen
- [ ] (what should be visible and correct)

### In the API
- [ ] (what the endpoint must return)

### In the database
- [ ] (what must be true in Supabase)

### What must not regress
- [ ] (what currently works that must keep working)

---

## Tests to run

```bash
# Replace with actual test commands
cd backend && python -m pytest tests/test_[module].py -v
cd repo-b && npx playwright test [flow]
```

---

## Screenshots or verification needed
- URL: (path)
- Expected: (description)

---

## Risk
- (what could go wrong)
- (rollback plan if needed)

---

## Update checklist (end of session)
- [ ] `docs/plans/[environment]/next-session.md` updated
- [ ] `docs/plans/[environment]/backlog.md` updated
- [ ] `docs/plans/01-shared-standards/` updated (if shared contract changed)
- [ ] `docs/tips.md` updated with reusable lesson (if any)
- [ ] Dispatch record status set to Done / Parked
