# Data Contract

The project writes bronze, silver, and gold outputs with `run_id` and explicit synthetic flags.

Required local proof outputs:

- `gold_property_weather_ops_features.csv`
- `gold_property_maintenance_risk_predictions.csv`
- `model_metrics.json`
- `source_status.json`
- `run_config.json`

Synthetic property operations records must never be represented as HappyCo production data.
