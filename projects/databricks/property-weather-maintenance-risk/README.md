# Property Weather Maintenance Risk

Databricks proof project for HappyCo-aligned weather-aware property operations intelligence.

This project uses public NOAA/FEMA-style weather risk concepts plus deterministic synthetic property operations data. It does not use HappyCo production data and does not claim a deployed production model.

## What It Proves

- Bronze -> Silver -> Gold lakehouse modeling pattern.
- Public hazard data enriched with property operations features.
- Predictive maintenance, inspection, make-ready, resident-impact, and vendor-capacity risk framing.
- MLflow/Databricks job readiness with fail-closed receipts.
- Local contract validation before Databricks execution.

## Default Parameters

- `start_year`: `2015`
- `end_year`: `2025`
- `holdout_year`: `2025`
- `catalog`: `main`
- `schema`: `property_ops_risk_ml`
- `fallback_schema`: `hive_metastore.property_ops_risk_ml`
- `experiment_name`: `/Shared/property_ops_weather_maintenance_risk_ml`
- `damage_threshold`: `25000`
- `synthetic_property_ops_enabled`: `true`
- `synthetic_property_count`: `250`
- `synthetic_unit_count`: `25000`
- `random_seed`: `42`

## Local Validation

```powershell
python -m pytest projects/databricks/property-weather-maintenance-risk/tests -q
python projects/databricks/property-weather-maintenance-risk/scripts/validate_outputs.py --mode local-contract
python projects/databricks/property-weather-maintenance-risk/scripts/validate_outputs.py --mode generate-local --out artifacts/happyco/weather-risk
```

## Databricks Execution

```powershell
cd projects/databricks/property-weather-maintenance-risk; databricks bundle validate -t dev
databricks bundle deploy -t dev
databricks bundle run property_weather_maintenance_risk_job -t dev
```

If Bundles are unavailable, use `resources/property_weather_maintenance_risk_job.json` as the job contract.

## Claim Boundary

Allowed after a successful receipt:

> Databricks ML training run executed on public weather and synthetic property operations data.

Not allowed:

- Claiming real HappyCo production data was used.
- A production HappyCo model was trained.
- A production model serving endpoint was deployed.
