# Meta Prompt Template — Market Rotation Engine

Use this template when generating build prompts from Feature Cards in Phase 3.

---

## Repo Safety Contract

Before any build work begins, acknowledge these constraints:

```
PROTECTED — DO NOT MODIFY:
- Existing REPE calculation engines (DCF, waterfall, IRR)
- Existing credit decisioning services (credit.py, credit_decisioning.py)
- Existing PDS dashboard services
- Supabase RLS policies on all existing tables
- Any table in schemas 274, 275, 277 (credit core, object model, workflow)
- Meridian demo environment assets and seed data

ADDITIVE ONLY:
- New tables must be CREATE TABLE, never ALTER existing tables
- New services must be new files, never overwrite existing service files
- New routes must be new files or additive endpoints in existing route files
- Frontend: new components, never modify existing component logic
```

---

## Feature Build Prompt Structure

```markdown
# FEATURE: {{TITLE}}

**Origin:** {{segment_name}} rotation on {{run_date}}
**Gap Category:** {{gap_category}}
**Priority Score:** {{priority_score}} | **Cross-Vertical:** {{cross_vertical_flag}}
**Card ID:** {{card_id}}

## Context

### Why This Exists
{{1-2 sentences describing the research task that surfaced this gap}}

### What Couldn't Be Done
{{Specific analytical capability that was missing during the research rotation}}

### Segment Intelligence Brief Reference
{{Link to the intelligence brief: docs/market-intelligence/YYYY-MM-DD-segment-slug.md}}

---

## Specification

### What It Does
{{Functional description — what the user/system can do after this is built}}

### Data Layer

**New Tables (additive only):**
```sql
{{Table definitions with columns, types, constraints, RLS policies}}
```

**Data Sources:**
{{List of APIs/feeds/computed sources with refresh cadence}}

**Data Pipeline:**
{{How data flows from source → storage → consumption}}

---

### Backend

**New Service File(s):**
- `backend/app/services/{{service_name}}.py`
  - `{{function_name}}({{params}}) -> {{return_type}}`
  - {{Description of what this function does}}

**New Route(s):**
- `{{HTTP_METHOD}} /api/v1/{{route_path}}`
  - Request: `{{request_shape}}`
  - Response: `{{response_shape}}`

**Dependencies:**
- {{External packages needed}}
- {{API keys needed, referenced by env var name}}

---

### Frontend

**New Component:**
- Name: `{{ComponentName}}`
- Location: `{{file_path}}`
- Props: `{{props_definition}}`

**Visualization:**
- Chart type: {{chart_type}}
- Library: {{recharts | d3 | plotly}}
- Interaction: {{hover, click, drill-down behaviors}}

**Integration Point:**
- Where in existing UI: {{page/tab/section}}
- Navigation: {{how user reaches this component}}

---

### Cross-Vertical Hooks

{{If applicable:}}
- **→ REPE:** {{How this feeds data to/from the REPE module}}
- **→ Credit:** {{How this connects to credit decisioning}}
- **→ PDS:** {{How this informs PDS dashboards}}

---

## Verification

1. {{Specific test with expected outcome}}
2. {{Specific test with expected outcome}}
3. {{Specific test with expected outcome}}

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from data source → storage → API → frontend render
5. No regressions: existing tests still pass
```
