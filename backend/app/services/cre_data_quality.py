"""CRE Data Quality Checks Service.

Runs configurable quality checks after each connector ingest run.
Results are stored in the cre_quality_check table.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db import get_cursor

log = logging.getLogger(__name__)


@dataclass(slots=True)
class CheckResult:
    check_type: str
    check_name: str
    table_name: str
    passed: bool
    metric_value: float | None
    threshold: float | None
    details: dict[str, Any]


# ---------------------------------------------------------------------------
# Per-source quality rule definitions
# ---------------------------------------------------------------------------

def _rules_tiger() -> list[dict]:
    return [
        {"check_type": "row_count", "check_name": "min_geography_rows", "table_name": "dim_geography",
         "params": {"min_rows": 3}},
        {"check_type": "fill_rate", "check_name": "geoid_fill", "table_name": "dim_geography",
         "params": {"column": "geoid", "min_rate": 1.0}},
        {"check_type": "fill_rate", "check_name": "geom_fill", "table_name": "dim_geography",
         "params": {"column": "geom", "min_rate": 0.90}},
    ]


def _rules_acs() -> list[dict]:
    return [
        {"check_type": "row_count", "check_name": "min_market_fact_rows", "table_name": "fact_market_timeseries",
         "params": {"min_rows": 10, "source_filter": "acs_5y"}},
        {"check_type": "value_range", "check_name": "median_income_range", "table_name": "fact_market_timeseries",
         "params": {"source_filter": "acs_5y", "metric_key": "median_income", "min_val": 0, "max_val": 500000}},
    ]


def _rules_bls() -> list[dict]:
    return [
        {"check_type": "row_count", "check_name": "min_bls_rows", "table_name": "fact_market_timeseries",
         "params": {"min_rows": 1, "source_filter": "bls_labor"}},
        {"check_type": "value_range", "check_name": "unemployment_rate_range", "table_name": "fact_market_timeseries",
         "params": {"source_filter": "bls_labor", "metric_key": "unemployment_rate", "min_val": 0, "max_val": 50}},
    ]


def _rules_hud() -> list[dict]:
    return [
        {"check_type": "row_count", "check_name": "min_hud_rows", "table_name": "fact_market_timeseries",
         "params": {"min_rows": 1, "source_filter": "hud_fmr"}},
        {"check_type": "value_range", "check_name": "fmr_range", "table_name": "fact_market_timeseries",
         "params": {"source_filter": "hud_fmr", "metric_key": "fair_market_rent", "min_val": 100, "max_val": 10000}},
    ]


RULE_REGISTRY: dict[str, list[dict]] = {
    "tiger_geography": _rules_tiger(),
    "acs_5y": _rules_acs(),
    "bls_labor": _rules_bls(),
    "hud_fmr": _rules_hud(),
}


# ---------------------------------------------------------------------------
# Check implementations
# ---------------------------------------------------------------------------

def _check_row_count(params: dict) -> CheckResult:
    """Check that a table has at least min_rows."""
    table = params["table_name"]
    min_rows = params["params"]["min_rows"]
    source_filter = params["params"].get("source_filter")

    with get_cursor() as cur:
        if source_filter:
            cur.execute(f"SELECT COUNT(*) AS cnt FROM {table} WHERE source = %s", (source_filter,))
        else:
            cur.execute(f"SELECT COUNT(*) AS cnt FROM {table}")
        row = cur.fetchone()

    count = row["cnt"] if row else 0
    return CheckResult(
        check_type="row_count",
        check_name=params["check_name"],
        table_name=table,
        passed=count >= min_rows,
        metric_value=float(count),
        threshold=float(min_rows),
        details={"source_filter": source_filter},
    )


def _check_fill_rate(params: dict) -> CheckResult:
    """Check that a column's non-null rate meets the threshold."""
    table = params["table_name"]
    column = params["params"]["column"]
    min_rate = params["params"]["min_rate"]

    with get_cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) AS total, COUNT({column}) AS filled FROM {table}"
        )
        row = cur.fetchone()

    total = row["total"] if row else 0
    filled = row["filled"] if row else 0
    rate = filled / total if total > 0 else 0.0

    return CheckResult(
        check_type="fill_rate",
        check_name=params["check_name"],
        table_name=table,
        passed=rate >= min_rate,
        metric_value=round(rate, 6),
        threshold=min_rate,
        details={"column": column, "total": total, "filled": filled},
    )


def _check_value_range(params: dict) -> CheckResult:
    """Check that values in a column are within expected bounds."""
    table = params["table_name"]
    source_filter = params["params"].get("source_filter")
    metric_key = params["params"].get("metric_key")
    min_val = params["params"]["min_val"]
    max_val = params["params"]["max_val"]

    where_parts = []
    bind_params: list[Any] = []
    if source_filter:
        where_parts.append("source = %s")
        bind_params.append(source_filter)
    if metric_key:
        where_parts.append("metric_key = %s")
        bind_params.append(metric_key)

    where_clause = " AND ".join(where_parts) if where_parts else "TRUE"

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE value < %s OR value > %s) AS outliers
            FROM {table}
            WHERE {where_clause}
            """,
            [min_val, max_val] + bind_params,
        )
        row = cur.fetchone()

    total = row["total"] if row else 0
    outliers = row["outliers"] if row else 0

    return CheckResult(
        check_type="value_range",
        check_name=params["check_name"],
        table_name=table,
        passed=outliers == 0,
        metric_value=float(outliers),
        threshold=0.0,
        details={"total": total, "outliers": outliers, "min_val": min_val, "max_val": max_val,
                 "source_filter": source_filter, "metric_key": metric_key},
    )


def _check_freshness(params: dict) -> CheckResult:
    """Check that the most recent successful run is within threshold."""
    source_key = params["params"]["source_key"]
    max_days = params["params"]["max_staleness_days"]

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT MAX(started_at) AS latest
            FROM cre_ingest_run
            WHERE source_key = %s AND status = 'success'
            """,
            (source_key,),
        )
        row = cur.fetchone()

    latest = row["latest"] if row else None
    if latest is None:
        return CheckResult(
            check_type="freshness", check_name=params["check_name"],
            table_name="cre_ingest_run", passed=False,
            metric_value=None, threshold=float(max_days),
            details={"source_key": source_key, "latest_run": None},
        )

    age_days = (datetime.now(timezone.utc) - latest).total_seconds() / 86400
    return CheckResult(
        check_type="freshness", check_name=params["check_name"],
        table_name="cre_ingest_run", passed=age_days <= max_days,
        metric_value=round(age_days, 2), threshold=float(max_days),
        details={"source_key": source_key, "latest_run": latest.isoformat()},
    )


_CHECK_DISPATCH = {
    "row_count": _check_row_count,
    "fill_rate": _check_fill_rate,
    "value_range": _check_value_range,
    "freshness": _check_freshness,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_quality_checks(run_id: str, source_key: str) -> list[CheckResult]:
    """Execute all registered quality rules for a source and persist results.

    Returns list of CheckResult objects.
    """
    rules = RULE_REGISTRY.get(source_key, [])
    if not rules:
        log.info("No quality rules registered for source %s", source_key)
        return []

    results: list[CheckResult] = []

    for rule in rules:
        check_fn = _CHECK_DISPATCH.get(rule["check_type"])
        if not check_fn:
            log.warning("Unknown check type: %s", rule["check_type"])
            continue

        try:
            result = check_fn(rule)
            results.append(result)
        except Exception as exc:
            log.warning("Quality check %s failed: %s", rule["check_name"], exc)
            results.append(CheckResult(
                check_type=rule["check_type"],
                check_name=rule["check_name"],
                table_name=rule.get("table_name", ""),
                passed=False,
                metric_value=None,
                threshold=None,
                details={"error": str(exc)},
            ))

    # Persist results
    _persist_results(run_id, source_key, results)

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    log.info("Quality checks for %s: %d passed, %d failed", source_key, passed, failed)

    return results


def _persist_results(run_id: str, source_key: str, results: list[CheckResult]) -> None:
    """Write check results to cre_quality_check table."""
    import json

    with get_cursor() as cur:
        for r in results:
            cur.execute(
                """
                INSERT INTO cre_quality_check
                  (run_id, source_key, table_name, check_type, check_name,
                   passed, metric_value, threshold, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    run_id, source_key, r.table_name, r.check_type, r.check_name,
                    r.passed, r.metric_value, r.threshold,
                    json.dumps(r.details),
                ),
            )
