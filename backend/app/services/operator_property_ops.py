from __future__ import annotations

import copy
import csv
import json
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any


FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "winston_demo"
    / "happyco_property_ops_seed.json"
)
LOCAL_ARTIFACT_ROOT = Path(__file__).resolve().parents[3] / "artifacts" / "happyco" / "ml"
ARTIFACT_ROOT = LOCAL_ARTIFACT_ROOT
DATABRICKS_ARTIFACT_ROOT = Path(__file__).resolve().parents[3] / "artifacts" / "happyco" / "databricks"
BUNDLED_ARTIFACT_ROOT = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "winston_demo"
    / "happyco_ml_artifacts"
)

AS_OF_DATE = date(2026, 5, 20)
DEMO_CAVEAT = "Synthetic demo data. Not HappyCo production data."
REQUIRED_MATCH_REASONS = {
    "exact_external_id",
    "normalized_address",
    "fuzzy_name",
    "geospatial_proximity_placeholder",
    "temporal_proximity",
    "manual_review_required",
}


class HappyCoFixtureMissing(RuntimeError):
    """Raised when the HappyCo property ops fixture is not available."""


def _read_seed() -> dict[str, Any]:
    try:
        return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HappyCoFixtureMissing(
            "HappyCo property ops demo data is not available in this environment."
        ) from exc


def _days_ago(days: int) -> str:
    return (AS_OF_DATE - timedelta(days=days)).isoformat()


def _safe_div(numerator: float | int | None, denominator: float | int | None) -> float | None:
    if numerator is None or denominator is None:
        return None
    denominator_value = float(denominator)
    if denominator_value == 0:
        return None
    return float(numerator) / denominator_value


def _round(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def _property_slug(property_id: str) -> str:
    return property_id.removeprefix("prop-")


def _building_letters(property_id: str) -> list[str]:
    return ["B", "C"] if property_id == "prop-parkline-commons" else ["A", "B"]


def _category_plan(property_id: str, index: int) -> str:
    if property_id == "prop-parkline-commons":
        return ["hvac", "hvac", "moisture", "safety", "plumbing", "hvac"][index % 6]
    if property_id == "prop-lakeshore-flats":
        return ["plumbing", "plumbing", "hvac", "safety", "general", "moisture"][index % 6]
    if property_id == "prop-harbor-point":
        return ["general", "turnover", "plumbing", "grounds", "hvac"][index % 5]
    if property_id == "prop-canyon-terrace":
        return ["moisture", "plumbing", "moisture", "hvac", "safety", "general"][index % 6]
    return ["general", "grounds", "plumbing", "turnover", "safety"][index % 5]


def _severity_for(property_id: str, category: str, index: int) -> int:
    base = {
        "hvac": 74,
        "moisture": 70,
        "safety": 66,
        "plumbing": 56,
        "electrical": 50,
        "turnover": 38,
        "grounds": 32,
        "general": 34,
    }.get(category, 40)
    if property_id == "prop-parkline-commons":
        base += 10
    elif property_id == "prop-harbor-point":
        base -= 16
    elif property_id == "prop-cedar-grove":
        base -= 8
    return max(10, min(99, base + (index % 5) - 2))


def _vendor_for(category: str, property_id: str, index: int) -> str:
    if property_id == "prop-parkline-commons" and category == "hvac":
        return "vendor-apex-maintenance"
    by_category = {
        "hvac": ["vendor-blue-sky-hvac", "vendor-apex-maintenance"],
        "plumbing": ["vendor-clearflow-plumbing", "vendor-apex-maintenance"],
        "moisture": ["vendor-northstar-restoration", "vendor-clearflow-plumbing"],
        "safety": ["vendor-safehome-inspections", "vendor-brightline-electric"],
        "electrical": ["vendor-brightline-electric"],
        "turnover": ["vendor-summit-turns"],
        "grounds": ["vendor-greenleaf-grounds"],
        "general": ["vendor-summit-turns", "vendor-greenleaf-grounds"],
    }
    options = by_category.get(category, ["vendor-summit-turns"])
    return options[index % len(options)]


def _materialize(seed: dict[str, Any]) -> dict[str, Any]:
    operators = copy.deepcopy(seed["operators"])
    properties = copy.deepcopy(seed["properties"])
    vendors = copy.deepcopy(seed["vendors"])
    vendor_by_id = {vendor["vendor_id"]: vendor for vendor in vendors}

    buildings = _build_buildings(properties)
    units = _build_units(buildings)
    inspections = _build_inspections(properties, buildings)
    findings = _build_findings(inspections)
    work_orders = _build_work_orders(properties, buildings, units, findings)
    resolution_events = _build_resolution_events(work_orders)
    resident_impact_events = _build_resident_impact_events(properties, work_orders)
    entity_resolution = copy.deepcopy(seed["messy_source_records"])
    source_records = copy.deepcopy(seed["messy_source_records"])
    benchmarks = _build_benchmarks(properties, findings, work_orders, resident_impact_events, vendor_by_id)
    vendor_performance = _build_vendor_performance(vendors, work_orders)
    evidence = _build_evidence(benchmarks, findings, work_orders, vendor_by_id)
    recommendations = _build_recommendations(properties, benchmarks, evidence)
    ml_feature_rows = _build_ml_feature_rows(properties, buildings, findings, work_orders, resident_impact_events, vendor_by_id)
    graph = _build_graph(
        operators=operators,
        properties=properties,
        buildings=buildings,
        units=units,
        inspections=inspections,
        findings=findings,
        work_orders=work_orders,
        vendors=vendors,
        resolution_events=resolution_events,
        resident_impact_events=resident_impact_events,
    )

    return {
        "metadata": {
            "fixture_version": seed["fixture_version"],
            "generated_at": seed["generated_at"],
            "demo_mode": True,
            "data_source": "synthetic_demo",
            "caveat": DEMO_CAVEAT,
            "as_of_date": AS_OF_DATE.isoformat(),
        },
        "operators": operators,
        "properties": properties,
        "buildings": buildings,
        "units": units,
        "inspections": inspections,
        "findings": findings,
        "work_orders": work_orders,
        "vendors": vendors,
        "resolution_events": resolution_events,
        "resident_impact_events": resident_impact_events,
        "source_records": source_records,
        "entity_resolution": entity_resolution,
        "benchmarks": benchmarks,
        "vendor_performance": vendor_performance,
        "evidence": evidence,
        "recommendations": recommendations,
        "ml_feature_rows": ml_feature_rows,
        "graph": graph,
    }


def _build_buildings(properties: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buildings: list[dict[str, Any]] = []
    for prop in properties:
        for letter in _building_letters(prop["property_id"]):
            buildings.append(
                {
                    "building_id": f"bldg-{_property_slug(prop['property_id'])}-{letter.lower()}",
                    "property_id": prop["property_id"],
                    "name": f"Building {letter}",
                    "canonical_label": f"{prop['name']} / Building {letter}",
                    "source_systems": ["happy_property", "legacy_inspections"],
                }
            )
    return buildings


def _build_units(buildings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for building in buildings:
        letter = building["name"].split()[-1]
        prop_slug = _property_slug(building["property_id"])
        for floor in (1, 2):
            for stack in range(1, 5):
                unit_code = f"{letter}-{floor}{stack:02d}"
                units.append(
                    {
                        "unit_id": f"unit-{prop_slug}-{letter.lower()}-{floor}{stack:02d}",
                        "property_id": building["property_id"],
                        "building_id": building["building_id"],
                        "unit_code": unit_code,
                        "bedrooms": 1 + ((floor + stack) % 3),
                        "source_systems": ["happy_property", "resident_ops"],
                    }
                )
    return units


def _build_inspections(properties: list[dict[str, Any]], buildings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inspections: list[dict[str, Any]] = []
    buildings_by_property = _group_by(buildings, "property_id")
    for prop in properties:
        for building in buildings_by_property[prop["property_id"]]:
            for idx in range(4):
                sequence = len([i for i in inspections if i["property_id"] == prop["property_id"]]) + 1
                inspections.append(
                    {
                        "inspection_id": f"insp-{_property_slug(prop['property_id'])}-{building['name'].split()[-1].lower()}-{idx + 1:02d}",
                        "property_id": prop["property_id"],
                        "building_id": building["building_id"],
                        "inspection_date": _days_ago(12 + sequence * 5),
                        "source_system": "legacy_inspections",
                        "inspection_type": "unit_turn" if idx % 2 == 0 else "preventive_maintenance",
                    }
                )
    return inspections


def _build_findings(inspections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    for inspection in inspections:
        prop_id = inspection["property_id"]
        counters.setdefault(prop_id, 0)
        for idx in range(3):
            counters[prop_id] += 1
            category = _category_plan(prop_id, counters[prop_id] + idx)
            severity = _severity_for(prop_id, category, counters[prop_id])
            findings.append(
                {
                    "finding_id": f"finding-{prop_id}-{counters[prop_id]:04d}",
                    "inspection_id": inspection["inspection_id"],
                    "property_id": prop_id,
                    "building_id": inspection["building_id"],
                    "category": category,
                    "severity_score": severity,
                    "description": f"{category.title()} deficiency identified during {inspection['inspection_type']} inspection.",
                    "deficiency_code": f"{category[:3].upper()}-{severity:02d}",
                    "source_system": "legacy_inspections",
                    "requires_work_order": severity >= 45,
                }
            )
    return findings


def _build_work_orders(
    properties: list[dict[str, Any]],
    buildings: list[dict[str, Any]],
    units: list[dict[str, Any]],
    findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    work_orders: list[dict[str, Any]] = []
    buildings_by_property = _group_by(buildings, "property_id")
    units_by_property = _group_by(units, "property_id")
    findings_by_property = _group_by(findings, "property_id")
    for prop in properties:
        prop_id = prop["property_id"]
        for idx in range(1, int(prop["work_order_count"]) + 1):
            if prop_id == "prop-parkline-commons" and idx <= 12:
                category = "hvac"
                repeat_cluster_id = "cluster-parkline-hvac-bc"
                repeat_flag = True
                reopened = idx in {2, 5, 8, 11}
                opened_days_ago = 4 + idx * 4
            else:
                category = _category_plan(prop_id, idx)
                repeat_cluster_id = f"cluster-{_property_slug(prop_id)}-{category}-{idx % 4}"
                repeat_flag = idx % (4 if prop["risk_profile"] == "high" else 7) == 0
                reopened = idx % (9 if prop["risk_profile"] != "low" else 17) == 0
                opened_days_ago = 9 + idx * (2 + (idx % 3))
            building = buildings_by_property[prop_id][idx % len(buildings_by_property[prop_id])]
            unit = units_by_property[prop_id][idx % len(units_by_property[prop_id])]
            linked_finding = findings_by_property[prop_id][(idx - 1) % len(findings_by_property[prop_id])]
            aging_days = max(1, min(31, (opened_days_ago // 2) + (6 if reopened else 0)))
            status = "reopened" if reopened else ("open" if idx % 11 == 0 else "closed")
            work_orders.append(
                {
                    "work_order_id": f"wo-{prop_id}-{idx:04d}",
                    "property_id": prop_id,
                    "building_id": building["building_id"],
                    "unit_id": unit["unit_id"],
                    "linked_finding_id": linked_finding["finding_id"],
                    "category": category,
                    "status": status,
                    "priority": "high" if prop_id == "prop-parkline-commons" and category in {"hvac", "moisture"} else "medium",
                    "opened_date": _days_ago(opened_days_ago),
                    "closed_date": None if status == "open" else _days_ago(max(0, opened_days_ago - aging_days)),
                    "aging_days": aging_days,
                    "reopened": reopened,
                    "repeat_flag": repeat_flag,
                    "repeat_cluster_id": repeat_cluster_id,
                    "vendor_id": _vendor_for(category, prop_id, idx),
                    "source_system": "cmms_export",
                }
            )
    return work_orders


def _build_resolution_events(work_orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for idx, work_order in enumerate(work_orders[:100], start=1):
        events.append(
            {
                "resolution_event_id": f"res-{idx:04d}",
                "work_order_id": work_order["work_order_id"],
                "property_id": work_order["property_id"],
                "vendor_id": work_order["vendor_id"],
                "resolved_date": work_order["closed_date"],
                "resolution_type": "reopen_review" if work_order["reopened"] else "standard_close",
                "first_time_fix": not work_order["reopened"],
            }
        )
    return events


def _build_resident_impact_events(
    properties: list[dict[str, Any]], work_orders: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    work_orders_by_property = _group_by(work_orders, "property_id")
    for prop in properties:
        for idx in range(1, int(prop["resident_impact_count"]) + 1):
            related = work_orders_by_property[prop["property_id"]][(idx - 1) % len(work_orders_by_property[prop["property_id"]])]
            events.append(
                {
                    "resident_impact_event_id": f"impact-{_property_slug(prop['property_id'])}-{idx:03d}",
                    "property_id": prop["property_id"],
                    "work_order_id": related["work_order_id"],
                    "event_type": "resident_complaint" if idx % 3 else "repeat_visit",
                    "event_date": _days_ago(3 + idx * 3),
                    "impact_score": 4 if prop["risk_profile"] == "high" else (2 if prop["risk_profile"] == "medium" else 1),
                    "source_system": "resident_ops",
                }
            )
    return events


def _build_benchmarks(
    properties: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    work_orders: list[dict[str, Any]],
    resident_impact_events: list[dict[str, Any]],
    vendor_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    findings_by_property = _group_by(findings, "property_id")
    work_orders_by_property = _group_by(work_orders, "property_id")
    impacts_by_property = _group_by(resident_impact_events, "property_id")
    rows: list[dict[str, Any]] = []
    for prop in properties:
        prop_work_orders = work_orders_by_property[prop["property_id"]]
        total = len(prop_work_orders)
        repeat_count = sum(1 for row in prop_work_orders if row["repeat_flag"])
        reopened_count = sum(1 for row in prop_work_orders if row["reopened"])
        aging_values = [row["aging_days"] for row in prop_work_orders if row.get("aging_days") is not None]
        vendor_rates = [vendor_by_id[row["vendor_id"]]["first_time_fix_rate"] for row in prop_work_orders]
        finding_scores = [row["severity_score"] for row in findings_by_property[prop["property_id"]]]
        repeat_rate = _safe_div(repeat_count * 100, total)
        reopened_rate = _safe_div(reopened_count * 100, total)
        rows.append(
            {
                "property_id": prop["property_id"],
                "property_name": prop["name"],
                "peer_group": prop["peer_group"],
                "unit_count": prop["unit_count"],
                "work_order_count": total,
                "repeat_work_order_count": repeat_count,
                "repeat_work_order_rate": _round(repeat_rate, 1),
                "repeat_work_orders_per_100_units": _round(_safe_div(repeat_count * 100, prop["unit_count"]), 1),
                "average_aging_days": _round(sum(aging_values) / len(aging_values) if aging_values else None, 1),
                "reopened_rate": _round(reopened_rate, 1),
                "inspection_severity_score": _round(sum(finding_scores) / len(finding_scores) if finding_scores else None, 1),
                "vendor_first_time_fix_rate": _round((sum(vendor_rates) / len(vendor_rates)) * 100 if vendor_rates else None, 1),
                "resident_impact_proxy_count": len(impacts_by_property.get(prop["property_id"], [])),
            }
        )

    for row in rows:
        peer_values = [
            other["repeat_work_order_rate"]
            for other in rows
            if other["peer_group"] == row["peer_group"]
            and other["property_id"] != row["property_id"]
            and other["repeat_work_order_rate"] is not None
        ]
        row["peer_repeat_work_order_rate_median"] = _round(median(peer_values), 1) if peer_values else None
        variance = (
            row["repeat_work_order_rate"] - row["peer_repeat_work_order_rate_median"]
            if row["repeat_work_order_rate"] is not None and row["peer_repeat_work_order_rate_median"] is not None
            else None
        )
        row["repeat_rate_variance_to_peer"] = _round(variance, 1)
        ratio = (
            row["repeat_work_order_rate"] / row["peer_repeat_work_order_rate_median"]
            if row["repeat_work_order_rate"] is not None
            and row["peer_repeat_work_order_rate_median"]
            and row["peer_repeat_work_order_rate_median"] > 0
            else None
        )
        row["repeat_rate_peer_ratio"] = _round(ratio, 2)
        row["risk_flag"] = (
            "high"
            if (ratio or 0) >= 1.5 or row["property_id"] == "prop-parkline-commons"
            else "medium"
            if (ratio or 0) >= 1.15 or (row["reopened_rate"] or 0) > 8
            else "low"
        )
    return rows


def _build_vendor_performance(vendors: list[dict[str, Any]], work_orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    work_orders_by_vendor = _group_by(work_orders, "vendor_id")
    rows: list[dict[str, Any]] = []
    for vendor in vendors:
        assigned = work_orders_by_vendor.get(vendor["vendor_id"], [])
        aging = [row["aging_days"] for row in assigned if row.get("aging_days") is not None]
        categories = sorted({row["category"] for row in assigned})
        rows.append(
            {
                "vendor_id": vendor["vendor_id"],
                "name": vendor["name"],
                "total_work_orders": len(assigned),
                "first_time_fix_rate": _round(vendor["first_time_fix_rate"] * 100, 1),
                "average_aging_days": _round(sum(aging) / len(aging) if aging else None, 1),
                "configured_average_aging_days": vendor["average_aging_days"],
                "reopen_rate": _round(_safe_div(sum(1 for row in assigned if row["reopened"]) * 100, len(assigned)), 1),
                "category_concentration": categories,
                "underperforming_properties": sorted(
                    {
                        row["property_id"]
                        for row in assigned
                        if vendor["first_time_fix_rate"] < 0.65 or row["reopened"]
                    }
                ),
            }
        )
    return rows


def _build_evidence(
    benchmarks: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    work_orders: list[dict[str, Any]],
    vendor_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    parkline_hvac = [
        row for row in work_orders if row["property_id"] == "prop-parkline-commons" and row["category"] == "hvac"
    ][:12]
    parkline_reopened = [row for row in parkline_hvac if row["reopened"]]
    parkline_moisture = [
        row for row in findings if row["property_id"] == "prop-parkline-commons" and row["category"] == "moisture"
    ][:3]
    parkline_benchmark = next(row for row in benchmarks if row["property_id"] == "prop-parkline-commons")
    apex = vendor_by_id["vendor-apex-maintenance"]
    return [
        {
            "evidence_id": "ev-parkline-hvac-repeat-60d",
            "source_type": "work_order",
            "source_ids": [row["work_order_id"] for row in parkline_hvac],
            "statement": f"{len(parkline_hvac)} HVAC work orders in the last 60 days.",
        },
        {
            "evidence_id": "ev-parkline-reopened-hvac",
            "source_type": "work_order",
            "source_ids": [row["work_order_id"] for row in parkline_reopened],
            "statement": f"{len(parkline_reopened)} reopened HVAC tickets tied to the same equipment cluster.",
        },
        {
            "evidence_id": "ev-apex-first-time-fix",
            "source_type": "vendor",
            "source_ids": ["vendor-apex-maintenance"],
            "statement": f"Apex Maintenance first-time-fix rate is {round(apex['first_time_fix_rate'] * 100)}%.",
        },
        {
            "evidence_id": "ev-parkline-moisture-findings",
            "source_type": "finding",
            "source_ids": [row["finding_id"] for row in parkline_moisture],
            "statement": f"{len(parkline_moisture)} moisture findings mention HVAC-adjacent areas.",
        },
        {
            "evidence_id": "ev-parkline-peer-repeat-variance",
            "source_type": "benchmark",
            "source_ids": ["benchmark-prop-parkline-commons"],
            "statement": (
                "Repeat work-order rate is "
                f"{parkline_benchmark['repeat_rate_peer_ratio']}x peer median."
            ),
        },
    ]


def _build_recommendations(
    properties: list[dict[str, Any]], benchmarks: list[dict[str, Any]], evidence: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    benchmark_by_property = {row["property_id"]: row for row in benchmarks}
    evidence_by_id = {row["evidence_id"]: row for row in evidence}
    parkline_evidence = [
        "ev-parkline-hvac-repeat-60d",
        "ev-parkline-reopened-hvac",
        "ev-apex-first-time-fix",
        "ev-parkline-moisture-findings",
        "ev-parkline-peer-repeat-variance",
    ]
    recs = [
        {
            "recommendation_id": "rec-parkline-hvac-audit",
            "property_id": "prop-parkline-commons",
            "title": "Route Parkline Commons HVAC cluster to preventive review",
            "recommendation": (
                "Schedule a preventive HVAC audit for Parkline Commons Buildings B and C, "
                "pause automatic HVAC assignment to Apex Maintenance, and route reopened "
                "tickets to human review until first-time-fix improves."
            ),
            "confidence": 0.82,
            "risk_level": "high",
            "recommended_action": "preventive_hvac_audit",
            "human_review_required": True,
            "evidence_ids": parkline_evidence,
            "evidence": [evidence_by_id[eid] for eid in parkline_evidence],
            "ml_status": "not_available",
            "caveats": [DEMO_CAVEAT, "Benchmark-only deterministic recommendation until ML artifacts exist."],
        }
    ]
    for prop in properties:
        if prop["property_id"] == "prop-parkline-commons":
            continue
        benchmark = benchmark_by_property[prop["property_id"]]
        risk = benchmark["risk_flag"]
        recs.append(
            {
                "recommendation_id": f"rec-{_property_slug(prop['property_id'])}-watchlist",
                "property_id": prop["property_id"],
                "title": f"{prop['name']} operating watchlist",
                "recommendation": (
                    f"Monitor {prop['name']} against its peer group and review category-level "
                    "work-order concentration before changing vendor routing."
                ),
                "confidence": 0.68 if risk == "medium" else 0.6,
                "risk_level": risk,
                "recommended_action": "monitor_peer_variance",
                "human_review_required": risk != "low",
                "evidence_ids": [],
                "evidence": [],
                "ml_status": "not_available",
                "caveats": [DEMO_CAVEAT, "Benchmark-only deterministic recommendation until ML artifacts exist."],
            }
        )
    return recs


def _build_ml_feature_rows(
    properties: list[dict[str, Any]],
    buildings: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    work_orders: list[dict[str, Any]],
    resident_impact_events: list[dict[str, Any]],
    vendor_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    buildings_by_property = _group_by(buildings, "property_id")
    findings_by_property = _group_by(findings, "property_id")
    work_orders_by_property = _group_by(work_orders, "property_id")
    impacts_by_property = _group_by(resident_impact_events, "property_id")
    for prop in properties:
        for building in buildings_by_property[prop["property_id"]]:
            for category in ("hvac", "plumbing", "moisture"):
                prop_work_orders = [
                    row
                    for row in work_orders_by_property[prop["property_id"]]
                    if row["building_id"] == building["building_id"] and row["category"] == category
                ]
                prop_findings = [
                    row
                    for row in findings_by_property[prop["property_id"]]
                    if row["building_id"] == building["building_id"]
                ]
                vendor_rates = [
                    vendor_by_id[row["vendor_id"]]["first_time_fix_rate"]
                    for row in prop_work_orders
                    if row["vendor_id"] in vendor_by_id
                ]
                aging_values = [row["aging_days"] for row in prop_work_orders if row.get("aging_days") is not None]
                count_30 = sum(1 for row in prop_work_orders if _age_from_opened(row["opened_date"]) <= 30)
                count_60 = sum(1 for row in prop_work_orders if _age_from_opened(row["opened_date"]) <= 60)
                repeat_rate = _safe_div(sum(1 for row in prop_work_orders if row["repeat_flag"]), len(prop_work_orders))
                reopened_rate = _safe_div(sum(1 for row in prop_work_orders if row["reopened"]), len(prop_work_orders))
                severity_scores = [row["severity_score"] for row in prop_findings]
                row = {
                    "feature_row_id": f"feat-{_property_slug(prop['property_id'])}-{building['name'].split()[-1].lower()}-{category}",
                    "property_id": prop["property_id"],
                    "building_id": building["building_id"],
                    "category": category,
                    "trailing_30_day_work_order_count": count_30,
                    "trailing_60_day_work_order_count": count_60,
                    "repeat_work_order_rate": _round(repeat_rate, 3),
                    "reopened_work_order_rate": _round(reopened_rate, 3),
                    "average_aging_days": _round(sum(aging_values) / len(aging_values) if aging_values else None, 1),
                    "inspection_severity_score": _round(sum(severity_scores) / len(severity_scores) if severity_scores else None, 1),
                    "hvac_finding_count": sum(1 for item in prop_findings if item["category"] == "hvac"),
                    "plumbing_finding_count": sum(1 for item in prop_findings if item["category"] == "plumbing"),
                    "moisture_finding_count": sum(1 for item in prop_findings if item["category"] == "moisture"),
                    "safety_finding_count": sum(1 for item in prop_findings if item["category"] == "safety"),
                    "vendor_first_time_fix_rate": _round(sum(vendor_rates) / len(vendor_rates), 3) if vendor_rates else None,
                    "vendor_average_aging": _round(sum(aging_values) / len(aging_values) if aging_values else None, 1),
                    "resident_impact_proxy_count": len(impacts_by_property.get(prop["property_id"], [])),
                    "property_unit_count": prop["unit_count"],
                    "peer_group": prop["peer_group"],
                    "prior_escalation_flag": 1 if prop["risk_profile"] == "high" else 0,
                }
                row["maintenance_escalation_risk_30d"] = 1 if (
                    prop["property_id"] == "prop-parkline-commons" and category in {"hvac", "moisture"}
                ) or (
                    row["reopened_work_order_rate"] is not None and row["reopened_work_order_rate"] >= 0.25
                ) else 0
                rows.append(row)
    return rows


def _age_from_opened(opened_date: str) -> int:
    return (AS_OF_DATE - date.fromisoformat(opened_date)).days


def _build_graph(
    *,
    operators: list[dict[str, Any]],
    properties: list[dict[str, Any]],
    buildings: list[dict[str, Any]],
    units: list[dict[str, Any]],
    inspections: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    work_orders: list[dict[str, Any]],
    vendors: list[dict[str, Any]],
    resolution_events: list[dict[str, Any]],
    resident_impact_events: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for operator in operators:
        nodes.append({"id": operator["operator_id"], "type": "operator", "label": operator["name"], "risk_level": None, "metadata": operator})
    for prop in properties:
        nodes.append({"id": prop["property_id"], "type": "property", "label": prop["name"], "risk_level": prop["risk_profile"], "metadata": prop})
        edges.append({"source": prop["operator_id"], "target": prop["property_id"], "relationship": "manages", "evidence_ids": []})
    for building in buildings:
        nodes.append({"id": building["building_id"], "type": "building", "label": building["canonical_label"], "risk_level": None, "metadata": building})
        edges.append({"source": building["property_id"], "target": building["building_id"], "relationship": "contains", "evidence_ids": []})
    for unit in units:
        nodes.append({"id": unit["unit_id"], "type": "unit", "label": unit["unit_code"], "risk_level": None, "metadata": unit})
        edges.append({"source": unit["building_id"], "target": unit["unit_id"], "relationship": "contains", "evidence_ids": []})
    for inspection in inspections:
        nodes.append({"id": inspection["inspection_id"], "type": "inspection", "label": inspection["inspection_type"], "risk_level": None, "metadata": inspection})
        edges.append({"source": inspection["building_id"], "target": inspection["inspection_id"], "relationship": "inspected_by", "evidence_ids": []})
    for finding in findings:
        risk = "high" if finding["severity_score"] >= 75 else "medium" if finding["severity_score"] >= 55 else "low"
        nodes.append({"id": finding["finding_id"], "type": "finding", "label": finding["description"], "risk_level": risk, "metadata": finding})
        edges.append({"source": finding["inspection_id"], "target": finding["finding_id"], "relationship": "generates", "evidence_ids": [finding["finding_id"]]})
    for work_order in work_orders:
        risk = "high" if work_order["reopened"] or work_order["priority"] == "high" else "medium"
        nodes.append({"id": work_order["work_order_id"], "type": "work_order", "label": work_order["category"], "risk_level": risk, "metadata": work_order})
        edges.append({"source": work_order["linked_finding_id"], "target": work_order["work_order_id"], "relationship": "creates", "evidence_ids": [work_order["linked_finding_id"]]})
        edges.append({"source": work_order["work_order_id"], "target": work_order["vendor_id"], "relationship": "assigned_to", "evidence_ids": [work_order["work_order_id"]]})
    for vendor in vendors:
        nodes.append({"id": vendor["vendor_id"], "type": "vendor", "label": vendor["name"], "risk_level": "high" if vendor["first_time_fix_rate"] < 0.65 else "low", "metadata": vendor})
    for event in resolution_events:
        nodes.append({"id": event["resolution_event_id"], "type": "resolution_event", "label": event["resolution_type"], "risk_level": None, "metadata": event})
        edges.append({"source": event["vendor_id"], "target": event["resolution_event_id"], "relationship": "resolves", "evidence_ids": [event["work_order_id"]]})
    for event in resident_impact_events:
        risk = "high" if event["impact_score"] >= 4 else "medium" if event["impact_score"] >= 2 else "low"
        nodes.append({"id": event["resident_impact_event_id"], "type": "resident_impact_event", "label": event["event_type"], "risk_level": risk, "metadata": event})
        edges.append({"source": event["work_order_id"], "target": event["resident_impact_event_id"], "relationship": "impacts", "evidence_ids": [event["work_order_id"]]})
    return {"nodes": nodes, "edges": edges}


def _group_by(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row[key], []).append(row)
    return grouped


@lru_cache(maxsize=1)
def _dataset_cached() -> dict[str, Any]:
    return _materialize(_read_seed())


def get_dataset() -> dict[str, Any]:
    """Return the full deterministic HappyCo property ops demo dataset."""

    return copy.deepcopy(_dataset_cached())


def canonical_entities() -> dict[str, Any]:
    dataset = get_dataset()
    return {
        **dataset["metadata"],
        "operators": dataset["operators"],
        "properties": dataset["properties"],
        "buildings": dataset["buildings"],
        "units": dataset["units"],
        "inspections": dataset["inspections"],
        "findings": dataset["findings"],
        "work_orders": dataset["work_orders"],
        "vendors": dataset["vendors"],
        "resolution_events": dataset["resolution_events"],
        "resident_impact_events": dataset["resident_impact_events"],
        "source_records": dataset["source_records"],
        "entity_resolution": dataset["entity_resolution"],
    }


def graph() -> dict[str, Any]:
    dataset = get_dataset()
    return {**dataset["metadata"], **dataset["graph"]}


def entity_resolution_queue() -> dict[str, Any]:
    dataset = get_dataset()
    return {**dataset["metadata"], "records": dataset["entity_resolution"]}


def benchmark_metrics() -> dict[str, Any]:
    dataset = get_dataset()
    return {**dataset["metadata"], "benchmarks": dataset["benchmarks"]}


def vendor_performance_metrics() -> dict[str, Any]:
    dataset = get_dataset()
    return {**dataset["metadata"], "vendors": dataset["vendor_performance"]}


def recommendations() -> dict[str, Any]:
    dataset = get_dataset()
    return {**dataset["metadata"], "recommendations": dataset["recommendations"]}


def ml_feature_rows() -> list[dict[str, Any]]:
    dataset = get_dataset()
    return dataset["ml_feature_rows"]


def recommendations_with_ml() -> dict[str, Any]:
    payload = recommendations()
    ml_payload = ml_risk_predictions()
    predictions_by_property = {row["property_id"]: row for row in ml_payload.get("predictions", [])}
    for recommendation in payload["recommendations"]:
        prediction = predictions_by_property.get(recommendation["property_id"])
        if prediction:
            recommendation["ml_status"] = "available"
            recommendation["ml_risk_score"] = prediction["risk_score"]
            recommendation["risk_band"] = prediction["risk_band"]
            recommendation["top_model_drivers"] = prediction["top_drivers"]
            recommendation["model_version"] = prediction["model_version"]
            recommendation["trained_at"] = prediction["trained_at"]
        else:
            recommendation["ml_status"] = ml_payload["ml_status"]
    payload["ml_status"] = ml_payload["ml_status"]
    return payload


def ml_risk_predictions(*, property_id: str | None = None, artifact_root: Path | None = None) -> dict[str, Any]:
    metadata = get_dataset()["metadata"]
    root = artifact_root or _default_ml_artifact_root()
    databricks = databricks_run_status()
    required = [
        root / "predictions.csv",
        root / "model_metrics.json",
        root / "feature_importance.csv",
        root / "model_registry_record.json",
    ]
    if any(not path.exists() for path in required):
        return {
            **metadata,
            "ml_status": "not_available",
            "predictions": [],
            "model_metrics": None,
            "feature_importance": [],
            "model_registry": None,
            "databricks_status": databricks["databricks_status"],
            "databricks_run_id": databricks.get("databricks_run_id"),
            "databricks_run_url": databricks.get("databricks_run_url"),
            "databricks_receipt": databricks.get("databricks_receipt"),
            "missing_artifacts": [str(path) for path in required if not path.exists()],
        }

    metrics = json.loads((root / "model_metrics.json").read_text(encoding="utf-8"))
    registry = json.loads((root / "model_registry_record.json").read_text(encoding="utf-8"))
    raw_predictions = _read_csv(root / "predictions.csv")
    feature_importance = _read_csv(root / "feature_importance.csv")[:8]
    grouped: dict[str, dict[str, Any]] = {}
    for row in raw_predictions:
        if property_id and row["property_id"] != property_id:
            continue
        score = float(row["risk_score"])
        existing = grouped.get(row["property_id"])
        if existing is None or score > existing["risk_score"]:
            grouped[row["property_id"]] = {
                "property_id": row["property_id"],
                "risk_score": score,
                "risk_band": row["risk_band"],
                "top_drivers": json.loads(row["top_drivers"]),
                "model_version": row["model_version"],
                "trained_at": row["trained_at"],
                "demo_mode": row["demo_mode"].lower() == "true",
                "data_source": row["data_source"],
                "caveat": row["caveat"],
                "source_feature_row_id": row["feature_row_id"],
                "source_building_id": row["building_id"],
                "source_category": row["category"],
            }
    return {
        **metadata,
        "ml_status": "available",
        "predictions": sorted(grouped.values(), key=lambda item: item["risk_score"], reverse=True),
        "model_metrics": metrics,
        "feature_importance": feature_importance,
        "model_registry": registry,
        "databricks_status": databricks["databricks_status"],
        "databricks_run_id": databricks.get("databricks_run_id"),
        "databricks_run_url": databricks.get("databricks_run_url"),
        "databricks_receipt": databricks.get("databricks_receipt"),
    }


def databricks_run_status(*, artifact_root: Path | None = None) -> dict[str, Any]:
    """Return Databricks execution receipt status without shelling out at request time."""

    root = artifact_root or DATABRICKS_ARTIFACT_ROOT
    completed_path = root / "databricks_run_receipt.json"
    attempt_path = root / "databricks_run_attempt_receipt.json"
    if completed_path.exists():
        receipt = json.loads(completed_path.read_text(encoding="utf-8"))
        status = str(receipt.get("status") or "").lower()
        completed = bool(receipt.get("databricks_executed")) and status in {
            "completed",
            "success",
            "succeeded",
            "terminated",
        }
        return {
            "databricks_status": "completed" if completed else "attempted_failed",
            "databricks_run_id": receipt.get("run_id"),
            "databricks_run_url": receipt.get("run_page_url"),
            "databricks_receipt": receipt,
        }
    if attempt_path.exists():
        receipt = json.loads(attempt_path.read_text(encoding="utf-8"))
        return {
            "databricks_status": receipt.get("databricks_status") or "attempted_failed",
            "databricks_run_id": receipt.get("run_id"),
            "databricks_run_url": receipt.get("run_page_url"),
            "databricks_receipt": receipt,
        }
    return {
        "databricks_status": "not_run",
        "databricks_run_id": None,
        "databricks_run_url": None,
        "databricks_receipt": None,
    }


def _default_ml_artifact_root() -> Path:
    """Prefer local generated artifacts, then bundled synthetic demo artifacts."""

    if ARTIFACT_ROOT != LOCAL_ARTIFACT_ROOT:
        return ARTIFACT_ROOT
    generated_predictions = ARTIFACT_ROOT / "predictions.csv"
    if generated_predictions.exists():
        return ARTIFACT_ROOT
    return BUNDLED_ARTIFACT_ROOT


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))
