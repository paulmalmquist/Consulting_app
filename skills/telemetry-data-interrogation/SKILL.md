---
name: telemetry-data-interrogation
description: Interrogate the telemetry environment's data — slice rows, build pivots (group-by / crosstab), and produce summaries (counts, null-rates, distinct, freshness, top-value distributions) over the Databricks Lakebase tel_* serving tables. Read-only and safe. Triggers on "interrogate the telemetry data", "pivot the telemetry/tel_* data", "summarize tel_predictions / tel_stream_*", "what's the distribution of verdicts/anomalies", "row counts / null rates / freshness for the telemetry tables", "group the telemetry data by X", "crosstab X by Y".
---

# Telemetry Data Interrogation

Ad-hoc, read-only exploration of the data the **telemetry lab environment** runs on. That data lives
in the `novendor-telemetry` **Databricks Lakebase** (managed Postgres) instance — the `tel_*` serving
tables plus the `business` tenant dimension — after the 2026-06-23 Supabase→Lakebase migration
([[project_telemetry_lakebase_migration]]).

The capability is a single read-only CLI: **`scripts/telemetry_data_probe.py`**. It slices ROWS,
builds PIVOTS, and SUMMARIZES, with hard safety rails (read-only transaction + statement timeout +
SELECT-only guard + identifier validation). Credentials are discovered live from the `databricks`
CLI — no stored secrets.

## When to use

- "Summarize / profile `tel_predictions`" → row count, freshness, per-column null-rate, distinct,
  and top-value distributions.
- "Pivot verdicts by model" / "crosstab anomalies by channel" → group-by or 2-D crosstab.
- "Show me recent runs / filter rows where …" → projected, filtered, ordered row slices.
- "What's in the telemetry data / how many rows per table" → catalog.
- Any one-off read-only SQL against the telemetry data.

Not for: writes (blocked by design), non-telemetry app tables (those stayed on Supabase — use the
main DB tools), or a user-facing UI (that's the deferred follow-on; this is agent-driven first).

## The data (telemetry environment)

`catalog` prints the live inventory. The shape, as of the migration:

| Group | Tables | Notes |
|---|---|---|
| Inference | `tel_predictions` (~60k), `tel_anomaly_events`, `tel_drift_metrics` | scored windows, verdict GO/REVIEW/NO_GO |
| Runs / channels | `tel_test_runs`, `tel_telemetry_channels` | NASA C-MAPSS / SMAP-MSL / IMS + ISS live |
| Models | `tel_model_runs` | promoted MLflow champions + metrics/gate (jsonb) |
| Streaming | `tel_stream_readings_bronze` (~557k, partitioned), `tel_stream_readings` (~557k), `tel_stream_minute_agg` (~82k), `tel_etl_watermarks`, `tel_pipeline_status`, `tel_dq_assertions` (~18k) | live ISS medallion |
| Kafka provenance | `tel_stream_kafka_rows`, `tel_stream_consumer_offsets` | Stargate lane (empty until that consumer runs) |
| Fused vectors | `tel_fused_state_vectors` (pgvector 256-d), `tel_feature_manifest` | analog-retrieval embeddings |
| Copilot | `tel_copilot_interactions`, `tel_copilot_reports`, `tel_copilot_prompt_versions`, `tel_copilot_review_actions` | AI governance audit |
| Control tower | `tel_ct_decision`, `tel_ct_receipt`, `tel_ct_gemma_state`, `tel_ct_gemma_job` | go/no-go + signed receipts + Gemma lifecycle |
| NCR | `tel_ncr_records` (128), `tel_ncr_clusters`, `tel_ncr_backlog_weekly` | factory NCR intelligence |
| Dimension | `business` (read replica) | tenant resolution (`resolve_tenant_id`) |

## Commands

```bash
python scripts/telemetry_data_probe.py catalog                         # inventory: rows + columns per table
python scripts/telemetry_data_probe.py describe tel_predictions        # per-column type/null%/distinct/min/max
python scripts/telemetry_data_probe.py summary  tel_predictions        # + freshness + top-value distributions
python scripts/telemetry_data_probe.py rows  tel_test_runs --cols run_key,dataset,status --order created_at:desc --limit 10
python scripts/telemetry_data_probe.py rows  tel_predictions --where "verdict='NO_GO'" --cols channel_name,anomaly_score --limit 20
python scripts/telemetry_data_probe.py pivot tel_predictions --rows verdict --agg count
python scripts/telemetry_data_probe.py pivot tel_predictions --rows verdict --cols model_name --agg count       # 2-D crosstab
python scripts/telemetry_data_probe.py pivot tel_stream_readings --rows channel_name --value value --agg avg
python scripts/telemetry_data_probe.py sql "SELECT dataset, count(*) FROM tel_test_runs GROUP BY 1 ORDER BY 2 DESC"
```

Add `--json` to any command for machine-readable output. `--where` accepts a raw SQL predicate (it is
re-validated through the read-only guard). 2-D pivots cap to the top 20 column values by aggregate and
report what was omitted (no silent truncation).

## Safety model

- Connects as the Databricks identity (table owner → RLS is transparent), then `SET
  default_transaction_read_only = on` and `SET statement_timeout` (default 30s).
- Every user query passes `assert_readonly`: single statement, must start with SELECT/WITH/EXPLAIN/
  TABLE/VALUES, rejects any write/DDL keyword.
- Table and column names are validated against live introspection before interpolation.
- No credentials are stored: the instance endpoint, principal, and a short-lived password are fetched
  per run via `databricks database get-database-instance` / `current-user me` /
  `generate-database-credential`. Requires the `databricks` CLI authenticated (profile `PaulMain`).

## Configuration

Env overrides: `TEL_LAKEBASE_INSTANCE` (default `novendor-telemetry`), `TEL_LAKEBASE_DB`
(`databricks_postgres`), `DATABRICKS_PROFILE` (`PaulMain`), `TEL_PROBE_TIMEOUT` (`30s`).

## Extensions (not built yet)

- **Databricks Unity Catalog** (`novendor_1.telemetry` Delta medallion — the upstream training data):
  add a `--store databricks` mode over the SQL warehouse for source-side interrogation.
- **UI**: a pivot/summary surface in the telemetry lab env (backend group-by/aggregate endpoints + a
  React pivot builder) — the agreed follow-on after this skill.
