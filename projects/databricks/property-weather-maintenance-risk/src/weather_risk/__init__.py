"""weather_risk — modular property weather maintenance risk pipeline.

Public NOAA/FEMA weather/hazard concepts and synthetic property operations
data. Not HappyCo production data. Databricks-ready, package-driven pipeline.
"""
from .config import DEFAULT_CONFIG, WeatherRiskConfig, load_config
from .contracts import DEMO_CAVEAT, REQUIRED_CHARTS, REQUIRED_OUTPUTS, SUPPORTED_EVENT_TYPES
from .pipeline import generate_local_outputs, validate_local_contract
from .runner import run_pipeline, run_stage
from .synthetic_ops import generate_synthetic_property_ops
from .utils import normalize_event_type, normalize_fips, parse_damage_amount

__all__ = [
    "DEFAULT_CONFIG",
    "DEMO_CAVEAT",
    "REQUIRED_CHARTS",
    "REQUIRED_OUTPUTS",
    "SUPPORTED_EVENT_TYPES",
    "WeatherRiskConfig",
    "generate_local_outputs",
    "generate_synthetic_property_ops",
    "load_config",
    "normalize_event_type",
    "normalize_fips",
    "parse_damage_amount",
    "run_pipeline",
    "run_stage",
    "validate_local_contract",
]
