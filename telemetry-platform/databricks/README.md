# Databricks — lakehouse, training, jobs

The Databricks side of the platform: dataset download, medallion ingestion, feature engineering,
model training, and job definitions. Built in Phases 1–2.

## Layout

| Folder | Contents | Phase |
|---|---|---|
| `data/` | dataset download scripts (C-MAPSS, SMAP/MSL, IMS), idempotent, print SHA + row counts | 1 |
| `notebooks/` | medallion ingestion + feature engineering (Bronze → Silver → Gold) | 1 |
| `training/` | model training (baseline anomaly, LSTM autoencoder, RUL) logging to MLflow | 2 |
| `jobs/` | Databricks job definitions to run the above | 1–2 |

## Reuse the existing client

Do not write a new Databricks client. Use `skills/historyrhymes/scripts/databricks_client.py`
(`DatabricksClient`), which already implements warehouse start/stop, `execute_sql`, MLflow run
create/log, notebook import, Unity Catalog listing, and the Jobs API. Workspace/warehouse/experiment
config is in `skills/historyrhymes/config/databricks.json`.

## Schema isolation

Use the Unity Catalog schema `novendor_1.telemetry` via **fully-qualified SQL**
(`novendor_1.telemetry.<table>`). Do not edit `databricks.json` (it points the shared client at the
`historyrhymes` schema). Telemetry stays in its own schema without touching the shared config.

## Credentials

`DATABRICKS_PAT` must be exported before any call. If unset, source it from the repo-root
`claude_token.txt` and verify it authenticates with a read-only `warehouse_status()` call. Never
read, print, log, or commit the token value.

## Dependencies

`../requirements.txt` lists `mlflow`, `databricks-sql-connector`, `pyspark`, and the training stack.
Install these in the Databricks/training context only — never in `backend/requirements.txt`.
