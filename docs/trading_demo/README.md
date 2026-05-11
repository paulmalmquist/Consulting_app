# Trading Analytics Copilot Demo

This demo is built for the AI Engineer / Trading Analytics & Data Engineering profile. It shows Winston can load market-shaped data, compute deterministic analytics, route natural-language requests to tools, preserve evidence, and translate the same pipeline into a Databricks medallion pattern.

## What It Proves

- Databricks-shaped data engineering: Bronze raw rows, Silver aligned daily series, Gold analytics features.
- Trading analytics over energy markets: WTI, Brent, Henry Hub, Brent-WTI spread, DXY proxy, rates, volatility, inventories, storage, and rig count.
- Deterministic analytics: seasonality, rolling correlation, OLS regression, scenario shocks, historical analogs, and desk memos.
- Guarded copilot behavior: the UI works without an AI key and never fabricates analytics.
- Production habits: migration, seed script, tests, health/freshness status, run persistence, memo persistence, and clear source labels.

## Local Winston Flow

Apply the schema:

```bash
cd repo-b
node db/schema/apply.js --dry-run --files 610
node db/schema/apply.js --files 610
node db/schema/verify.js
```

Seed the canonical Trading Platform environment:

```bash
python backend/scripts/seed_trading_analytics_demo.py --env-slug trading
```

If the `trading` environment is missing and you want the seed script to provision it:

```bash
python backend/scripts/seed_trading_analytics_demo.py --env-slug trading --create-env
```

Open the route:

```text
/lab/env/<resolved-env-id>/trading
```

The seed script prints the resolved `env_id`.

## API Surface

- `GET /api/trading/v1/environments/{env_id}/health`
- `GET /api/trading/v1/environments/{env_id}/series`
- `GET /api/trading/v1/environments/{env_id}/seasonality`
- `GET /api/trading/v1/environments/{env_id}/correlation`
- `POST /api/trading/v1/environments/{env_id}/regression`
- `POST /api/trading/v1/environments/{env_id}/scenario`
- `GET /api/trading/v1/environments/{env_id}/analogs`
- `POST /api/trading/v1/environments/{env_id}/memo`
- `GET /api/trading/v1/environments/{env_id}/memo?limit=10`
- `POST /api/trading/v1/environments/{env_id}/copilot`

Every user-triggered analytics endpoint and copilot tool call creates a `trading_analytics_runs` row. Desk memos persist to `trading_memos`.

## Data Flow

- Bronze: `trading_market_series` stores raw or seeded observations with `source='demo_fixture:v1'`.
- Silver: the analytics service aligns daily rows by symbol and reports coverage/freshness.
- Gold: `trading_feature_series` stores deterministic return, z-score, and volatility features; analytics runs and memos provide the evidence trail.

Unavailable values remain unavailable. The UI does not hardcode displayed metrics.

## Supported Analytics

- Seasonality: current path vs historical average/P10/P90, with percentile.
- Rolling correlation: aligned return correlation over configurable windows.
- Regression: numpy least-squares OLS over aligned returns, coefficients, R2, sample size, and warnings.
- Scenario: deterministic sensitivity table over inventory, DXY, rate, VIX, and storage shocks.
- Historical analogs: demo state-vector similarity over returns, volatility, spread, inventory/storage, DXY, rates, and VIX.
- Memo: deterministic Markdown memo with question, method, data range, findings, caveats, confidence, freshness, and timestamp.

Minimum data thresholds:

- Seasonality: at least 3 prior years.
- Correlation: at least `window_days + 20` aligned observations.
- Regression: at least 120 aligned observations.
- Analogs: at least 250 aligned observations.

## Copilot Guardrails

The copilot routes known prompts to deterministic backend tools first:

- seasonality
- rolling correlation
- regression
- scenario
- analogs
- memo

If no AI credentials are configured, responses include `ai_available: false` and still return deterministic tool results. AI synthesis, if enabled later, must only summarize returned analytics JSON.

## Databricks Pathway

Use `databricks_medallion_pipeline.py` in local fixture mode first:

```bash
python docs/trading_demo/databricks_medallion_pipeline.py --mode local --output-dir .tmp/trading_demo
```

In Databricks, adapt the same script with Spark enabled and write Delta tables:

- `trading_demo.bronze.market_prices`
- `trading_demo.silver.normalized_series`
- `trading_demo.semantic.trading_features`

`trading_feature_engineering.sql` contains Unity Catalog / Delta examples for table definitions and semantic feature views.

## Smoke Test

With backend running:

```bash
python scripts/smoke_trading_analytics.py --backend-url http://localhost:8000 --env-id <env_id>
```

With frontend running too:

```bash
python scripts/smoke_trading_analytics.py --backend-url http://localhost:8000 --frontend-url http://localhost:3000 --env-id <env_id>
```

## Interview Demo Script

1. Open the Energy Trading Command Center.
2. Show Pipeline Health and Bronze/Silver/Gold freshness.
3. Ask: "Show 5-year natural gas seasonality and where current price sits by percentile."
4. Ask: "Run rolling 60-day correlation between WTI and Brent."
5. Ask: "Run a regression of WTI returns against DXY, rates, VIX, and inventory."
6. Ask: "Find historical analogs for the current crude setup."
7. Ask: "Generate a trader-facing memo with evidence and caveats."
8. Explain the Databricks mapping from fixture Bronze rows to governed Gold features.

## Known Limitations

- First pass uses deterministic `demo_fixture:v1` data, not live market feeds.
- Regression p-values are intentionally unavailable because the backend uses numpy only.
- Scenario sensitivities are transparent demo assumptions, not calibrated trading signals.
- Analog matching is a discussion engine, not a production recommendation system.

## Next Enhancements

- Replace fixture ingestion with governed public/live feed loaders.
- Persist Databricks-exported feature tables into Winston through a scheduled sync.
- Add MLflow experiment tracking for model variants and scenario calibration.
- Add Unity Catalog lineage and quality checks as first-class health signals.
