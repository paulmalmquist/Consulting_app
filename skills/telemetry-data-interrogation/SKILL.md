---
name: telemetry-data-interrogation
description: Interrogate Winston telemetry serving data with read-only row slices, pivots, crosstabs, summaries, counts, null rates, distinct values, freshness, and distributions. Use for "interrogate telemetry data", "pivot tel_*", "summarize tel_predictions", telemetry row counts, verdict distributions, or ad hoc read-only telemetry SQL.
---

# Telemetry Data Interrogation

Use `scripts/telemetry_data_probe.py` for read-only analysis of telemetry
serving tables in Databricks Lakebase.

Requires Python 3.10+, `psycopg`, and an authenticated Databricks CLI session.

Common commands:

```powershell
python scripts/telemetry_data_probe.py catalog
python scripts/telemetry_data_probe.py summary tel_predictions
python scripts/telemetry_data_probe.py rows tel_test_runs --cols run_key,dataset,status --order created_at:desc --limit 10
python scripts/telemetry_data_probe.py pivot tel_predictions --rows verdict --cols model_name --agg count
python scripts/telemetry_data_probe.py sql "SELECT dataset, count(*) FROM tel_test_runs GROUP BY 1"
```

Add `--json` for machine-readable output.

Safety contract:

- Read telemetry `tel_*` serving tables and the replicated `business`
  dimension only.
- Discover short-lived credentials through the authenticated Databricks CLI.
- Force read-only transactions and a statement timeout.
- Reject multiple statements, writes, DDL, unsafe identifiers, and unknown
  tables/columns.
- Never print credential values.

This skill is for interrogation, not schema changes, ETL writes, or UI
implementation. Route those to the data owner and classify them R2.
