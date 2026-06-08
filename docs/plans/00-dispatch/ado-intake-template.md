# Azure DevOps Intake Record

ADO-mapped intake template. Fill this when running the `azure-devops-intake`
skill. For non-ADO idea capture (parking-lot ideas, observations not yet ready
for the board), the older `idea-intake-template.md` remains as a fallback.

Org `paulmalmquist1984` · project `Novendor`.

---

**Date:** YYYY-MM-DD
**Source:** [Conversation / session discovery / test failure / sales call / observation]
**Status:** Classified / Proposed / Approved / Active / Resolved / Closed

---

## Raw request

> Paste the request, bug report, idea, or observation exactly as stated.

---

## Classification

**Type** (check all that apply)
- [ ] Feature
- [ ] Bug
- [ ] Refactor
- [ ] Design / UI
- [ ] AI runtime
- [ ] Data / schema
- [ ] DevOps / deployment
- [ ] Research / spike
- [ ] Documentation
- [ ] Board cleanup
- [ ] Security / compliance

**Domain** (check all that apply)
- [ ] Platform Core
- [ ] Auth / Security
- [ ] Multi-tenant Environment Provisioning
- [ ] AI Runtime / MCP
- [ ] Demo Lab
- [ ] REPE
- [ ] Legal Ops
- [ ] History Rhymes / Altered Mind
- [ ] Investment Engine
- [ ] Documents / Extraction
- [ ] Reporting / Semantic Metrics
- [ ] Compliance / Audit
- [ ] CRM / Consulting Ops
- [ ] Excel Add-in
- [ ] Orchestration / Codex Automation
- [ ] Marketing Site
- [ ] CI-CD / Deployment
- [ ] Design System

**Risk:** Low / Medium / High

**Affected repo surfaces:**
- [ ] backend/
- [ ] repo-b/
- [ ] repo-c/
- [ ] excel-addin/
- [ ] orchestration/
- [ ] scripts/
- [ ] docs/
- [ ] supabase/

---

## Existing work item check

Result of `az boards query` — matching Epic/Feature/Story IDs found, or "none":

> ...

---

## ADO mapping

| Level | ID | Title | Status |
|---|---|---|---|
| Epic | #... | ... | existing / NEW |
| Feature | #... | ... | existing / NEW |
| User Story / Bug | #... | ... | existing / NEW |
| Task | #... | ... | NEW |
| Task | #... | ... | NEW |

**Area Path:** `Novendor\<Area>`
**Iteration:** `Novendor\Sprint <N>` (only if planned for the current sprint)
**Tags:** `Tag1; Tag2`

---

## Acceptance criteria

### Screen
- [ ] (visible/UI behavior, if applicable)

### API
- [ ] (endpoint behavior, if applicable)

### DB / Data
- [ ] (schema/data/provenance behavior, if applicable)

### AI behavior
- [ ] (runtime/tool/fail-closed behavior, if applicable)

### Evals / tests
- [ ] (required tests)

### Regression guard
- [ ] (what must not break)

---

## Test plan

```bash
# Replace with actual commands
cd backend && python -m pytest tests/test_[module].py -v
cd repo-b && npx playwright test [flow]
```

---

## Evidence required

- [ ] (screenshots, logs, test output, API response, DB query, Playwright trace, deployment URL)

---

## Risk & rollback

- (what could go wrong)
- (rollback plan if needed)

---

## Out of scope

- (explicit boundaries)

---

## End-of-session checklist

- [ ] ADO state moved (Resolved, or Closed only if merged + deploy/smoke verified)
- [ ] ADO audit comment added (branch/commit/PR, files, tests, evidence, risks, next item)
- [ ] PR/branch/artifact links attached to the work item
- [ ] Active plan/docs updated
- [ ] `docs/tips.md` updated with reusable lesson (if any)
- [ ] Final Report produced
