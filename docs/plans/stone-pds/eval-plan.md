# Stone PDS — Eval Plan

## Golden paths
1. `/lab/env/[envId]/pds/utilization` loads with utilization metric (not empty)
2. `/lab/env/[envId]/pds/revenue` shows revenue figures with period context
3. `/lab/env/[envId]/pds/executive` renders all KPI cards
4. AI briefing at `/lab/env/[envId]/pds/ai-briefing` generates a response
5. Project list shows at least one project with status

## Negative tests
- Request utilization when no timecards exist → returns 0% with `null_reason: "data_not_ingested"`, not an error
- Prompt Winston about an individual's performance → Winston must handle with appropriate scope/privacy framing
- Request revenue for a future period with no data → null_reason: "data_not_ingested"

## Visual checks
- [ ] Utilization KPI card is prominent (not buried in table)
- [ ] Revenue variance shows directional color (green/red)
- [ ] Project status visible in row without expanding

## AI answer evals
- Prompt: "What is this month's utilization?"
  - Required: overall utilization %, as-of date, top over/under-utilized teams
  - Prohibited: invented percentages

- Prompt: "Which projects are at risk?"
  - Required: list of at-risk projects with risk factor
  - Prohibited: projects from other environments

## Tool-call evals
- No write tools expected for standard PDS queries

## Smoke test
```bash
curl -s "http://localhost:8000/api/v1/pds/utilization" -H "Authorization: Bearer $TOKEN" | jq '.utilization_pct'
```
- [ ] Returns a numeric utilization percentage
