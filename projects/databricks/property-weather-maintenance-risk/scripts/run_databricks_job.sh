#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$PROJECT_DIR" && databricks bundle validate -t dev)
(cd "$PROJECT_DIR" && databricks bundle deploy -t dev)
(cd "$PROJECT_DIR" && databricks bundle run property_weather_maintenance_risk_job -t dev)
