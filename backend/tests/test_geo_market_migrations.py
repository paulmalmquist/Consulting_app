"""Tests for geo market migration presence and core schema surface."""

from pathlib import Path


MIGRATION_DIR = (
    Path(__file__).resolve().parents[2]
    / "repo-b"
    / "db"
    / "migrations"
)


def _read(name: str) -> str:
    path = MIGRATION_DIR / name
    assert path.exists()
    return path.read_text()


def test_geo_market_migration_files_exist():
    for name in [
        "017_geo_market_foundation.sql",
        "018_geo_market_materializations.sql",
        "019_geo_market_seed_and_registry.sql",
    ]:
        assert (MIGRATION_DIR / name).exists()


def test_geo_market_foundation_tables_present():
    sql = _read("017_geo_market_foundation.sql")
    for table in [
        "dim_geo_county",
        "dim_geo_tract",
        "dim_geo_block_group",
        "dim_geo_metric_catalog",
        "geo_polygon_cache",
        "fact_geo_market_snapshot",
        "fact_geo_hazard_context",
        "fact_asset_market_context",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql


def test_geo_market_materialization_views_present():
    sql = _read("018_geo_market_materializations.sql")
    for view in [
        "vw_geo_metric_latest",
        "vw_geo_hazard_latest",
        "vw_pipeline_property_geo_context",
        "vw_asset_market_context_latest",
    ]:
        assert f"CREATE OR REPLACE VIEW {view}" in sql


def test_geo_market_seed_contains_core_overlays():
    sql = _read("019_geo_market_seed_and_registry.sql")
    for key in [
        "median_hh_income",
        "median_age",
        "population",
        "renter_share",
        "vacancy_rate",
        "median_gross_rent",
        "median_home_value",
        "mobility_proxy",
        "hazard_flood_risk",
        "labor_context",
    ]:
        assert f"'{key}'" in sql
