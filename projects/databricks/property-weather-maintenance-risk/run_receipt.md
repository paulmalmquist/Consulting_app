# Property Weather Maintenance Risk Receipt

Status: success

## Databricks Run

- Job ID: `172758362681895`
- Run ID: `924781458483845`
- Run URL: `https://dbc-2504bec5-b5ab.cloud.databricks.com/?o=7474657239253594#job/172758362681895/run/924781458483845`
- Result: `TERMINATED / SUCCESS`
- Namespace used: `hive_metastore.property_ops_risk_ml` after `main` catalog fallback.

## Outputs

- `run_config`
- `source_status`
- `synthetic_properties`, `synthetic_units`, `synthetic_inspections`, `synthetic_work_orders`, `synthetic_make_ready_turns`, `synthetic_vendors`, `synthetic_resident_incidents`
- `gold_property_weather_ops_features`
- `model_metrics`
- `gold_property_maintenance_risk_predictions`
- `run_receipt`

## Claim Boundary

Allowed claim: Databricks ML training run executed on public weather and synthetic property operations data.

Not allowed: real HappyCo production data, production HappyCo model, model serving endpoint, or production deployment.

## Caveat

Public weather concepts and synthetic property operations data. Not HappyCo production data. SparkML model artifact logging was fail-soft on serverless because no UC Volume temp path is configured; MLflow params, metrics, run IDs, tables, and predictions were written.
