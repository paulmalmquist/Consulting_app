from __future__ import annotations

import math
import re
from datetime import date
from decimal import Decimal
from hashlib import sha256
from typing import Any

from app.schemas.underwriting import FactClass, Unit

NORMALIZATION_VERSION = "uw_norm_v1"

_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _as_str(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _extract_number(value: Any) -> float:
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    s = _as_str(value).replace(",", "")
    match = _NUM_RE.search(s)
    if not match:
        raise ValueError(f"Could not parse numeric value from: {value!r}")
    return float(match.group(0))


def parse_percent_to_decimal(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        n = float(value)
    else:
        s = _as_str(value).lower()
        n = _extract_number(s)
        if "%" in s:
            n = n / 100.0
        elif "bps" in s:
            n = n / 10000.0
    if n > 1.0:
        n = n / 100.0
    return n


def parse_bps(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        n = float(value)
    else:
        s = _as_str(value).lower()
        n = _extract_number(s)
        if "%" in s:
            n = n * 100.0
    return n


def parse_currency_to_cents(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value * 100))
    if isinstance(value, Decimal):
        return int((value * Decimal("100")).quantize(Decimal("1")))

    s = _as_str(value)
    neg = s.startswith("(") and s.endswith(")")
    s = s.replace("$", "").replace(",", "").replace("(", "").replace(")", "")
    n = float(_extract_number(s))
    cents = int(round(n * 100))
    return -cents if neg else cents


def parse_sf(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    s = _as_str(value).lower().replace(",", "")
    s = s.replace("square feet", "").replace("sq ft", "").replace("sf", "")
    return float(_extract_number(s))


def parse_ratio(value: Any) -> float:
    return float(_extract_number(value))


def _normalize_address(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]", "", value.lower())
    return cleaned


def _size_band(value: float) -> int:
    if value <= 0:
        return 0
    return int(round(value / 500.0) * 500)


def _zscore_flags(values: list[float], threshold: float = 2.5) -> list[bool]:
    if len(values) < 3:
        return [False] * len(values)
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    std = math.sqrt(var)
    if std == 0:
        return [False] * len(values)
    return [abs((v - mean) / std) > threshold for v in values]


def _coerce_by_unit(value: Any, unit: str | None) -> tuple[str, Any]:
    if unit == Unit.pct_decimal.value:
        return "decimal", parse_percent_to_decimal(value)
    if unit == Unit.usd_cents.value:
        return "integer", parse_currency_to_cents(value)
    if unit == Unit.sf.value:
        return "decimal", parse_sf(value)
    if unit in (Unit.units.value, Unit.count.value):
        return "integer", int(round(_extract_number(value)))
    if unit == Unit.bps.value:
        return "decimal", parse_bps(value)
    if unit == Unit.ratio.value:
        return "decimal", parse_ratio(value)

    if isinstance(value, bool):
        return "bool", value
    if isinstance(value, int):
        return "integer", value
    if isinstance(value, float):
        return "decimal", value
    if isinstance(value, dict) or isinstance(value, list):
        return "json", value

    s = _as_str(value)
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return "date", date.fromisoformat(s)
    return "text", s


def normalize_research_payload(payload: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []

    normalized_sources: list[dict[str, Any]] = []
    for source in payload.get("sources", []):
        excerpt = _as_str(source.get("raw_text_excerpt"))
        excerpt_hash = sha256(excerpt.encode("utf-8")).hexdigest()
        normalized_sources.append(
            {
                "citation_key": source["citation_key"],
                "url": source["url"],
                "title": source.get("title"),
                "publisher": source.get("publisher"),
                "date_accessed": source.get("date_accessed"),
                "raw_text_excerpt": source.get("raw_text_excerpt"),
                "excerpt_hash": excerpt_hash,
                "raw_payload": source.get("raw_payload") or {},
            }
        )

    normalized_datums: list[dict[str, Any]] = []
    for datum in payload.get("extracted_datapoints", []):
        unit = datum.get("unit")
        value_kind, normalized_value = _coerce_by_unit(datum.get("value"), unit)
        row_warnings: list[str] = []
        if unit == Unit.pct_decimal.value and isinstance(normalized_value, float):
            if normalized_value < 0 or normalized_value > 1:
                row_warnings.append("percent_out_of_range")
        normalized_datums.append(
            {
                "datum_key": datum["datum_key"],
                "fact_class": datum["fact_class"],
                "citation_key": datum.get("citation_key"),
                "unit": unit,
                "confidence": datum.get("confidence"),
                "value_kind": value_kind,
                "value": normalized_value,
                "warnings": row_warnings,
            }
        )
        warnings.extend([f"{datum['datum_key']}:{w}" for w in row_warnings])

    sale_by_key: dict[str, dict[str, Any]] = {}
    for comp in payload.get("sale_comps", []):
        size_sf = parse_sf(comp.get("size_sf")) if comp.get("size_sf") is not None else 0.0
        close_date = comp.get("close_date")
        close_bucket = str(close_date)[:7] if close_date else "unknown"
        dedupe_key = (
            f"{_normalize_address(comp['address'])}|"
            f"{close_bucket}|{_size_band(size_sf)}"
        )
        cap_rate = (
            parse_percent_to_decimal(comp.get("cap_rate"))
            if comp.get("cap_rate") is not None
            else None
        )
        row = {
            "address": comp["address"],
            "submarket": comp.get("submarket"),
            "close_date": comp.get("close_date"),
            "sale_price_cents": parse_currency_to_cents(comp.get("sale_price")),
            "cap_rate": cap_rate,
            "noi_cents": parse_currency_to_cents(comp.get("noi")) if comp.get("noi") is not None else None,
            "size_sf": size_sf,
            "citation_key": comp.get("citation_key"),
            "confidence": comp.get("confidence"),
            "dedupe_key": dedupe_key,
            "warnings": [],
            "is_outlier": False,
        }
        if cap_rate is not None and (cap_rate < 0 or cap_rate > 0.2):
            row["warnings"].append("cap_rate_out_of_range")
            warnings.append(f"sale_comp:{dedupe_key}:cap_rate_out_of_range")

        previous = sale_by_key.get(dedupe_key)
        if previous is None:
            sale_by_key[dedupe_key] = row
        else:
            prev_conf = previous.get("confidence") or 0
            new_conf = row.get("confidence") or 0
            if new_conf >= prev_conf:
                sale_by_key[dedupe_key] = row

    normalized_sale_comps = list(sale_by_key.values())
    sale_cap_rates = [r["cap_rate"] for r in normalized_sale_comps if r.get("cap_rate") is not None]
    sale_cap_flags = _zscore_flags([float(v) for v in sale_cap_rates])
    flag_idx = 0
    for comp in normalized_sale_comps:
        if comp.get("cap_rate") is None:
            continue
        if sale_cap_flags[flag_idx]:
            comp["is_outlier"] = True
            comp["warnings"].append("cap_rate_zscore_outlier")
            warnings.append(f"sale_comp:{comp['dedupe_key']}:cap_rate_zscore_outlier")
        flag_idx += 1

    lease_by_key: dict[str, dict[str, Any]] = {}
    for comp in payload.get("lease_comps", []):
        size_sf = parse_sf(comp.get("size_sf")) if comp.get("size_sf") is not None else 0.0
        lease_date = comp.get("lease_date")
        date_bucket = str(lease_date)[:7] if lease_date else "unknown"
        dedupe_key = (
            f"{_normalize_address(comp['address'])}|"
            f"{date_bucket}|{_size_band(size_sf)}"
        )
        row = {
            "address": comp["address"],
            "submarket": comp.get("submarket"),
            "lease_date": comp.get("lease_date"),
            "rent_psf_cents": parse_currency_to_cents(comp.get("rent_psf")),
            "term_months": comp.get("term_months"),
            "size_sf": size_sf,
            "concessions_cents": (
                parse_currency_to_cents(comp.get("concessions"))
                if comp.get("concessions") is not None
                else None
            ),
            "citation_key": comp.get("citation_key"),
            "confidence": comp.get("confidence"),
            "dedupe_key": dedupe_key,
            "warnings": [],
            "is_outlier": False,
        }
        previous = lease_by_key.get(dedupe_key)
        if previous is None:
            lease_by_key[dedupe_key] = row
        else:
            prev_conf = previous.get("confidence") or 0
            new_conf = row.get("confidence") or 0
            if new_conf >= prev_conf:
                lease_by_key[dedupe_key] = row

    normalized_lease_comps = list(lease_by_key.values())
    lease_rents = [float(r["rent_psf_cents"]) for r in normalized_lease_comps]
    lease_flags = _zscore_flags(lease_rents)
    for i, comp in enumerate(normalized_lease_comps):
        if lease_flags[i]:
            comp["is_outlier"] = True
            comp["warnings"].append("rent_psf_zscore_outlier")
            warnings.append(f"lease_comp:{comp['dedupe_key']}:rent_psf_zscore_outlier")

    normalized_market_snapshot: list[dict[str, Any]] = []
    for metric in payload.get("market_snapshot", []):
        metric_unit = metric.get("unit")
        value_kind, metric_value = _coerce_by_unit(metric.get("metric_value"), metric_unit)
        if value_kind not in {"decimal", "integer"}:
            metric_value = float(_extract_number(metric.get("metric_value")))
        row_warnings: list[str] = []
        if metric.get("metric_key") in {"cap_rate", "exit_cap_rate"} and (
            float(metric_value) < 0 or float(metric_value) > 0.2
        ):
            row_warnings.append("cap_rate_out_of_range")
            warnings.append(f"market:{metric['metric_key']}:cap_rate_out_of_range")
        if metric.get("metric_key") in {"vacancy_rate"} and (
            float(metric_value) < 0 or float(metric_value) > 1
        ):
            row_warnings.append("vacancy_out_of_range")
            warnings.append(f"market:{metric['metric_key']}:vacancy_out_of_range")
        normalized_market_snapshot.append(
            {
                "metric_key": metric["metric_key"],
                "metric_date": metric.get("metric_date"),
                "metric_grain": metric.get("metric_grain") or "point",
                "metric_value": metric_value,
                "unit": metric_unit,
                "citation_key": metric.get("citation_key"),
                "confidence": metric.get("confidence"),
                "warnings": row_warnings,
            }
        )

    return {
        "contract_version": payload.get("contract_version") or "uw_research_contract_v1",
        "sources": normalized_sources,
        "extracted_datapoints": normalized_datums,
        "sale_comps": normalized_sale_comps,
        "lease_comps": normalized_lease_comps,
        "market_snapshot": normalized_market_snapshot,
        "unknowns": payload.get("unknowns") or [],
        "assumption_suggestions": payload.get("assumption_suggestions") or [],
        "warnings": warnings,
        "stats": {
            "source_count": len(normalized_sources),
            "datum_count": len(normalized_datums),
            "sale_comp_count": len(normalized_sale_comps),
            "lease_comp_count": len(normalized_lease_comps),
            "market_metric_count": len(normalized_market_snapshot),
            "sale_comp_deduped": max(0, len(payload.get("sale_comps", [])) - len(normalized_sale_comps)),
            "lease_comp_deduped": max(0, len(payload.get("lease_comps", [])) - len(normalized_lease_comps)),
        },
    }


def validate_citation_requirements(payload: dict[str, Any]) -> None:
    for datum in payload.get("extracted_datapoints", []):
        fact_class = datum.get("fact_class")
        citation_key = _as_str(datum.get("citation_key"))
        if fact_class == FactClass.fact.value and not citation_key:
            raise ValueError(f"Fact datum '{datum.get('datum_key')}' requires citation_key")

    for comp in payload.get("sale_comps", []):
        if not _as_str(comp.get("citation_key")):
            raise ValueError(f"Sale comp '{comp.get('address')}' requires citation_key")

    for comp in payload.get("lease_comps", []):
        if not _as_str(comp.get("citation_key")):
            raise ValueError(f"Lease comp '{comp.get('address')}' requires citation_key")

    for metric in payload.get("market_snapshot", []):
        if not _as_str(metric.get("citation_key")):
            raise ValueError(f"Market metric '{metric.get('metric_key')}' requires citation_key")
