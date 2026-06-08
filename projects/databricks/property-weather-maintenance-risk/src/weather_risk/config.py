"""Configuration for the property weather maintenance risk pipeline.

`WeatherRiskConfig` is the single typed config object carried through every
stage. `load_config()` builds one from (in increasing precedence) defaults, a
JSON file, environment variables, and explicit overrides — so the same config
contract works for local CLI runs, env-driven CI, and Databricks job params.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, fields, replace
from pathlib import Path
from typing import Any

# Event types are a fixed contract, kept here alongside the config that uses
# them as a default. `contracts.py` re-exports this for backwards compatibility.
SUPPORTED_EVENT_TYPES = {
    "tornado",
    "hail",
    "thunderstorm wind",
    "flash flood",
    "flood",
    "hurricane/typhoon",
    "winter storm",
    "wildfire",
    "drought",
}


@dataclass(frozen=True)
class WeatherRiskConfig:
    start_year: int = 2015
    end_year: int = 2025
    holdout_year: int = 2025
    event_types: tuple[str, ...] = tuple(sorted(SUPPORTED_EVENT_TYPES))
    sample_frac: float = 1.0
    catalog: str = "main"
    schema: str = "property_ops_risk_ml"
    fallback_schema: str = "hive_metastore.property_ops_risk_ml"
    experiment_name: str = "/Shared/property_ops_weather_maintenance_risk_ml"
    damage_threshold: int = 25000
    synthetic_property_ops_enabled: bool = True
    synthetic_property_count: int = 250
    synthetic_unit_count: int = 25000
    random_seed: int = 42


DEFAULT_CONFIG = WeatherRiskConfig()

# Env var prefix for environment-driven overrides, e.g. WEATHER_RISK_RANDOM_SEED.
_ENV_PREFIX = "WEATHER_RISK_"

# Fields that are not safely overridable via untyped string sources.
_TUPLE_FIELDS = {"event_types"}
_BOOL_FIELDS = {"synthetic_property_ops_enabled"}
_INT_FIELDS = {
    "start_year",
    "end_year",
    "holdout_year",
    "damage_threshold",
    "synthetic_property_count",
    "synthetic_unit_count",
    "random_seed",
}
_FLOAT_FIELDS = {"sample_frac"}


def _coerce(name: str, value: Any) -> Any:
    """Coerce a string/scalar value to the type the config field expects."""
    if value is None:
        return None
    if name in _TUPLE_FIELDS:
        if isinstance(value, (list, tuple)):
            return tuple(str(item).strip() for item in value)
        return tuple(item.strip() for item in str(value).split(",") if item.strip())
    if name in _BOOL_FIELDS:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}
    if name in _INT_FIELDS:
        return int(value)
    if name in _FLOAT_FIELDS:
        return float(value)
    return str(value)


def _valid_field_names() -> set[str]:
    return {f.name for f in fields(WeatherRiskConfig)}


def load_config(
    *,
    config_path: str | Path | None = None,
    env: dict[str, str] | None = None,
    overrides: dict[str, Any] | None = None,
) -> WeatherRiskConfig:
    """Build a WeatherRiskConfig from defaults + JSON file + env + overrides.

    Precedence (low to high): DEFAULT_CONFIG, JSON file, environment variables,
    explicit overrides. Unknown keys are ignored so Databricks job widgets that
    carry extra params do not break the loader.
    """
    valid = _valid_field_names()
    resolved: dict[str, Any] = {}

    if config_path is not None:
        path = Path(config_path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"Config file must contain a JSON object: {path}")
        for key, value in data.items():
            if key in valid:
                resolved[key] = _coerce(key, value)

    env = env if env is not None else dict(os.environ)
    for key, value in env.items():
        if not key.startswith(_ENV_PREFIX):
            continue
        field_name = key[len(_ENV_PREFIX):].lower()
        if field_name in valid:
            resolved[field_name] = _coerce(field_name, value)

    if overrides:
        for key, value in overrides.items():
            if key in valid and value is not None:
                resolved[key] = _coerce(key, value)

    return replace(DEFAULT_CONFIG, **resolved)
