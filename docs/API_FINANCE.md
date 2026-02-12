# Finance API (`/api/finance/*`)

All endpoints are served by Business OS backend (`backend/`, FastAPI).

## 1) Deals
### `GET /api/finance/deals`
List all finance deals.

### `POST /api/finance/deals`
Create deal + partners + optional property + optional seeded waterfall + optional default scenario.

Request body (shape):
```json
{
  "fund_name": "Sunset Growth Fund I",
  "deal_name": "Sunset Commons JV",
  "strategy": "Value-Add Multifamily",
  "start_date": "2024-01-15",
  "currency": "USD",
  "partners": [
    {
      "name": "Blue Oak Capital",
      "role": "LP",
      "commitment_amount": 9000000,
      "ownership_pct": 0.9,
      "has_promote": false
    },
    {
      "name": "Winston Sponsor",
      "role": "GP",
      "commitment_amount": 1000000,
      "ownership_pct": 0.1,
      "has_promote": true
    }
  ],
  "waterfall": {
    "name": "Sunset Standard Waterfall",
    "distribution_frequency": "monthly",
    "promote_structure_type": "american",
    "tiers": []
  },
  "seed_default_scenario": true
}
```

Response:
```json
{
  "deal_id": "...",
  "fund_id": "...",
  "waterfall_id": "...",
  "default_scenario_id": "..."
}
```

### `GET /api/finance/deals/{deal_id}`
Return deal envelope:
- deal header
- partners
- properties
- waterfalls + tiers
- scenarios + assumptions

## 2) Scenarios
### `POST /api/finance/deals/{deal_id}/scenarios`
Create a scenario and persist assumptions.

### `PUT /api/finance/scenarios/{scenario_id}`
Update scenario header and upsert assumptions.

## 3) Cashflow Import
### `POST /api/finance/deals/{deal_id}/cashflows/import`
Bulk insert scenario cashflow events.

Request:
```json
{
  "scenario_id": "...",
  "events": [
    {
      "date": "2024-01-15",
      "event_type": "capital_call",
      "amount": 10000000,
      "property_id": null,
      "metadata": {"memo": "Initial equity"}
    }
  ]
}
```

## 4) Runs
### `POST /api/finance/deals/{deal_id}/runs`
Run deterministic waterfall engine and persist outputs.

Request:
```json
{
  "scenario_id": "...",
  "waterfall_id": "..."
}
```

Response:
```json
{
  "model_run_id": "...",
  "status": "completed",
  "reused_existing": false,
  "run_hash": "...",
  "engine_version": "wf_engine_v1.0.0"
}
```

Idempotence behavior:
- If a completed run already exists for same `(deal_id, scenario_id, waterfall_id, run_hash, engine_version)`, endpoint returns the existing run (`reused_existing=true`).

## 5) Run Outputs
### `GET /api/finance/runs/{run_id}/summary`
Returns:
- run metadata (`run_hash`, `engine_version`, status timestamps)
- computed metrics map (`lp_irr`, `gp_irr`, `lp_em`, `gp_em`, `total_promote`, `dpi`, `tvpi`, `moic`, etc.)
- run meta map

### `GET /api/finance/runs/{run_id}/distributions?group_by=partner|tier|date`
Returns grouped totals and detailed distribution rows (tier attribution + lineage JSON).

### `GET /api/finance/runs/{run_id}/explain?partner_id=...&date=YYYY-MM-DD`
Returns partner/date explain rows (tier-by-tier) for drilldown panels.

If `date` is omitted, latest date for that partner/run is used.

## Errors
Common status codes:
- `400` validation / malformed payload / model execution failure
- `404` missing deal / scenario / waterfall / run / explain rows

## Frontend Usage
Routes in repo-b:
- `/app/finance/deals`
- `/app/finance/deals/[dealId]`
- `/app/finance/deals/[dealId]/scenario/[scenarioId]`
- `/app/finance/runs/[runId]`
