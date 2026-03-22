# docs/dashboard_requests — Dashboard Request Inbox

This directory holds structured markdown dashboard requests. Each file defines a
dashboard's purpose, metrics, layout, and interactions. Winston agents read these files
and generate dashboard specs automatically.

---

## Workflow

```
1. Copy template.md → docs/dashboard_requests/<name>.md
2. Fill in required sections: Purpose, Key Metrics, Layout, Entity Scope
3. (Optional) Add Filters, Visualizations, Interactions, Outputs
4. Ask Winston to generate the dashboard
5. Review in the builder UI, iterate
6. Save and share
```

---

## Generating a dashboard from a spec file

### Via Telegram / Winston command bar

```
build dashboard from: docs/dashboard_requests/real_estate_fund_dashboard.md
```

### Via the generate endpoint directly

```bash
curl -X POST https://www.paulmalmquist.com/api/re/v2/dashboards/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Real Estate Fund Performance Dashboard. Track portfolio IRR, equity multiple, fund NAV, NOI trend, deal pipeline, and asset performance table. Entity scope: fund.",
    "entity_type": "fund",
    "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
    "business_id": "a1b2c3d4-0001-0001-0001-000000000001",
    "quarter": "2026Q1"
  }'
```

The response includes a full `DashboardSpec` with `widgets[]`, `layout_archetype`,
`entity_scope`, and `query_manifest`.

---

## Files

| File | Purpose |
|---|---|
| `template.md` | Blank dashboard request template — copy for each new request |
| `schema.md` | Agent parsing rules — how agents interpret the markdown format |
| `real_estate_fund_dashboard.md` | Example: fund performance dashboard with 7 widgets |

---

## Required sections (minimum viable request)

A request missing any of these will be rejected by the agent:

1. `## Purpose` — what question does this answer?
2. `## Key Metrics` — what numbers must appear?
3. `## Layout` — what is the visual structure?
4. `## Entity Scope` — what entities does it cover? (asset / fund / portfolio)

---

## Naming convention

`<slug>.md` — lowercase, hyphens, no dates needed
Examples: `monthly-operating-report.md`, `fund-performance-q1.md`, `watchlist.md`

---

## Iterating with the agent

After generating, tell Winston:

```
add an occupancy trend section to: docs/dashboard_requests/real_estate_fund_dashboard.md
```

Winston will update the markdown spec and re-generate the dashboard.

---

## Tips

- The more specific the `## Layout` section, the fewer correction rounds needed.
- Widget types in `## Visualizations` override the agent's inferred types.
- `## Notes for Winston Agent` is the right place to document known data gaps or
  table-level constraints (e.g., "maturity date column may be missing").
- The `comparison_table` widget type is the correct choice for any "actual vs budget"
  or "actual vs underwriting" view.
