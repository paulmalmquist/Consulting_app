from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from app.assistant_runtime.meridian_structured_capabilities import (
    find_meridian_capability,
    list_meridian_structured_capabilities,
)
from app.services.metric_capability_metadata import (
    REPE_ENTITY_KEYS,
    resolve_execution_capability,
)
from app.services.unified_metric_registry import MetricContract, UnifiedMetricRegistry, get_registry

_SYNTHETIC_FAMILIES: dict[str, str] = {
    "asset_count": "capital",
    "fund_list": "inventory",
    "performance_family": "returns",
}


def build_metric_inventory_response(
    *,
    business_id: str,
    env_id: str,
    scope: str = "all",
    registry: UnifiedMetricRegistry | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    metric_registry = registry or get_registry(business_id=business_id)
    built = _build_inventory(metric_registry)
    generated = generated_at or datetime.now(UTC)

    platform_metrics = [entry for entry in built["entries"] if entry.pop("_include_in_platform", False)]
    meridian_askable_metrics = [
        entry for entry in built["entries"] if entry.pop("_include_in_meridian", False)
    ]

    if scope == "platform":
        meridian_askable_metrics = []
    elif scope == "meridian":
        platform_metrics = []

    response = {
        "business_id": business_id,
        "env_id": env_id,
        "generated_at": generated,
        "inventory_hash": _compute_inventory_hash(
            platform_metrics=platform_metrics,
            meridian_askable_metrics=meridian_askable_metrics,
            drift_issues=built["drift_issues"],
            summary=built["summary"],
        ),
        "summary": built["summary"],
        "platform_metrics": platform_metrics,
        "meridian_askable_metrics": meridian_askable_metrics,
        "drift_issues": built["drift_issues"],
    }
    return response


def render_metric_inventory_markdown(response: dict[str, Any]) -> str:
    lines = [
        "# Meridian Metric Inventory",
        "",
        f"- Business ID: `{response['business_id']}`",
        f"- Environment ID: `{response['env_id']}`",
        f"- Generated At: `{response['generated_at']}`",
        f"- Inventory Hash: `{response['inventory_hash']}`",
        "",
        "## Summary",
        "",
        f"- Declared metric count: {response['summary']['declared_metric_count']}",
        f"- Executable metric count: {response['summary']['executable_metric_count']}",
        f"- Meridian askable count: {response['summary']['meridian_askable_count']}",
        f"- Drift issue count: {response['summary']['drift_issue_count']}",
        "",
        "## Platform Metrics",
        "",
    ]

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in response["platform_metrics"]:
        grouped[entry.get("metric_family") or "uncategorized"].append(entry)

    for family in sorted(grouped):
        lines.extend([
            f"### {family}",
            "",
            "| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |",
            "|---|---|---|---|---|---|---|---|---|",
        ])
        for entry in sorted(grouped[family], key=lambda item: item["metric_key"]):
            lines.append(
                "| {metric_key} | {canonical_source} | {natural_grain} | {declared_breakouts} | {validated_group_bys} | {platform_tx} | {meridian_tx} | {fallback_grain} | {status} |".format(
                    metric_key=entry["metric_key"],
                    canonical_source=entry.get("canonical_source") or "n/a",
                    natural_grain=entry.get("natural_grain") or "n/a",
                    declared_breakouts=", ".join(entry.get("declared_breakouts") or []) or "n/a",
                    validated_group_bys=", ".join(entry.get("validated_group_bys") or []) or "n/a",
                    platform_tx=", ".join(entry.get("supported_transformations_platform") or []) or "n/a",
                    meridian_tx=", ".join(entry.get("supported_transformations_meridian") or []) or "n/a",
                    fallback_grain=entry.get("fallback_grain") or "n/a",
                    status=entry.get("inventory_status") or "n/a",
                ),
            )
        lines.append("")

    if response["meridian_askable_metrics"]:
        lines.extend([
            "## Askable Examples",
            "",
        ])
        for entry in response["meridian_askable_metrics"]:
            examples = ", ".join(build_help_examples(entry))
            lines.append(f"- `{entry['metric_key']}`: {examples}")
        lines.append("")

    if response["drift_issues"]:
        lines.extend([
            "## Drift Issues",
            "",
            "| Metric | Issue Type | Message |",
            "|---|---|---|",
        ])
        for issue in response["drift_issues"]:
            lines.append(f"| {issue['metric_key']} | {issue['issue_type']} | {issue['message']} |")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def build_help_examples(entry: dict[str, Any]) -> list[str]:
    key = entry["metric_key"]
    transformations = set(entry.get("supported_transformations_meridian") or [])
    examples: list[str] = []
    if key == "fund_list":
        examples.extend(["give me a rundown of the funds", "list all funds"])
    elif key == "performance_family":
        examples.append("summarize each funds performance")
    elif key == "gross_irr":
        examples.append("list investments by gross IRR descending as of 2026Q1")
    elif key == "asset_count":
        examples.extend(["how many total assets are there in the portfolio", "which ones are not active"])
    elif key == "total_commitments":
        examples.extend(["how much do we have in total commitments", "can you break that out by fund"])
    elif key == "noi_variance":
        examples.extend(["sort the assets by NOI variance", "which have an NOI variance of -5% or worse"])
    elif key == "occupancy":
        examples.append("which assets have occupancy above 90%")
    else:
        if "summary" in transformations:
            examples.append(f"show me {key.replace('_', ' ')}")
        if "rank" in transformations:
            examples.append(f"rank by {key.replace('_', ' ')}")
        if "filter" in transformations:
            examples.append(f"filter by {key.replace('_', ' ')}")
    return examples[:3]


def _build_inventory(registry: UnifiedMetricRegistry) -> dict[str, Any]:
    entries: dict[str, dict[str, Any]] = {}
    drift_issues: list[dict[str, str]] = []
    declared_metric_count = 0

    for contract in sorted(registry.list_all(), key=lambda item: item.metric_key):
        if not _is_repe_contract(contract):
            continue
        declared_metric_count += 1
        entry, issues = _entry_from_contract(contract)
        entries[entry["metric_key"]] = entry
        drift_issues.extend(issues)

    for capability in list_meridian_structured_capabilities():
        if capability.inventory_key in entries:
            entry = entries[capability.inventory_key]
            entry["supported_transformations_meridian"] = list(capability.supported_transformations)
            if capability.inventory_key not in {"performance_family", "fund_list"} and entry["inventory_status"] != "drifted":
                entry["inventory_status"] = "meridian_askable"
            entry["_include_in_meridian"] = entry["inventory_status"] == "meridian_askable"
            continue

        synthetic_entry = {
            "metric_key": capability.inventory_key,
            "display_name": capability.display_name,
            "aliases": list(capability.runtime_metric_keys + capability.runtime_fact_keys),
            "metric_family": _SYNTHETIC_FAMILIES.get(capability.inventory_key, "operations"),
            "entity_key": _entity_key_for_grain(capability.natural_grain),
            "query_strategy": _synthetic_query_strategy(capability),
            "template_key": capability.template_keys[0] if capability.template_keys else None,
            "service_function": capability.service_keys[0] if capability.service_keys else None,
            "canonical_source": capability.canonical_source,
            "natural_grain": capability.natural_grain,
            "declared_breakouts": list(capability.supported_group_bys),
            "validated_group_bys": list(capability.supported_group_bys),
            "supported_transformations_platform": list(capability.supported_transformations),
            "supported_transformations_meridian": list(capability.supported_transformations),
            "time_behavior": "latest_snapshot",
            "fallback_grain": capability.fallback_grain,
            "inventory_status": "meridian_askable",
            "warnings": [],
            "_include_in_platform": True,
            "_include_in_meridian": True,
        }
        entries[capability.inventory_key] = synthetic_entry

    executable_metric_count = sum(1 for entry in entries.values() if entry["_include_in_platform"])
    meridian_askable_count = sum(1 for entry in entries.values() if entry["_include_in_meridian"])

    sorted_entries = [entries[key] for key in sorted(entries)]
    summary = {
        "declared_metric_count": declared_metric_count,
        "executable_metric_count": executable_metric_count,
        "meridian_askable_count": meridian_askable_count,
        "drift_issue_count": len(drift_issues),
    }

    return {
        "entries": sorted_entries,
        "drift_issues": sorted(drift_issues, key=lambda item: (item["metric_key"], item["issue_type"])),
        "summary": summary,
    }


def _entry_from_contract(contract: MetricContract) -> tuple[dict[str, Any], list[dict[str, str]]]:
    capability = resolve_execution_capability(contract)
    meridian_capability = find_meridian_capability(inventory_key=contract.metric_key)
    declared_breakouts = sorted(contract.allowed_breakouts)
    validated_group_bys = sorted(capability.supported_group_bys) if capability else []
    warnings: list[str] = []
    issues: list[dict[str, str]] = []

    inventory_status = "declared_only"
    include_in_platform = False
    has_breakout_gap = False
    has_canonical_gap = False

    if capability is not None:
        include_in_platform = True
        inventory_status = "executable"
        if not capability.canonical_source or not capability.natural_grain:
            has_canonical_gap = True
            issues.append(_drift_issue(contract.metric_key, "missing_canonical_source", "Execution metadata is missing canonical source or natural grain."))

        unsupported_breakouts = sorted(set(declared_breakouts) - set(validated_group_bys))
        if unsupported_breakouts:
            has_breakout_gap = True
            warnings.append(f"Declared breakouts not yet validated: {', '.join(unsupported_breakouts)}")
            issues.append(
                _drift_issue(
                    contract.metric_key,
                    "declared_breakouts_not_validated",
                    f"Declared breakouts exceed validated group-bys: {', '.join(unsupported_breakouts)}.",
                ),
            )

    else:
        issues.append(_drift_issue(contract.metric_key, "missing_execution_path", "Declared metric has no explicit template/service/semantic execution proof."))

    if meridian_capability is not None:
        if capability is None:
            inventory_status = "drifted"
            issues.append(_drift_issue(contract.metric_key, "runtime_support_missing_inventory_proof", "Meridian runtime supports this metric but the inventory lacks deterministic execution proof."))
        elif not has_canonical_gap:
            inventory_status = "meridian_askable"
        else:
            inventory_status = "drifted"
    elif has_canonical_gap or has_breakout_gap:
        inventory_status = "drifted"

    entry = {
        "metric_key": contract.metric_key,
        "display_name": contract.display_name,
        "aliases": list(contract.aliases),
        "metric_family": contract.metric_family,
        "entity_key": contract.entity_key,
        "query_strategy": contract.query_strategy,
        "template_key": contract.template_key,
        "service_function": contract.service_function,
        "canonical_source": capability.canonical_source if capability else None,
        "natural_grain": capability.natural_grain if capability else None,
        "declared_breakouts": declared_breakouts,
        "validated_group_bys": validated_group_bys,
        "supported_transformations_platform": list(capability.supported_transformations) if capability else [],
        "supported_transformations_meridian": list(meridian_capability.supported_transformations) if meridian_capability else [],
        "time_behavior": contract.time_behavior,
        "fallback_grain": capability.fallback_grain if capability else None,
        "inventory_status": inventory_status,
        "warnings": warnings,
        "_include_in_platform": include_in_platform,
        "_include_in_meridian": inventory_status == "meridian_askable",
    }
    return entry, issues


def _is_repe_contract(contract: MetricContract) -> bool:
    return (contract.entity_key or "") in REPE_ENTITY_KEYS


def _drift_issue(metric_key: str, issue_type: str, message: str) -> dict[str, str]:
    return {"metric_key": metric_key, "issue_type": issue_type, "message": message}


def _compute_inventory_hash(
    *,
    platform_metrics: list[dict[str, Any]],
    meridian_askable_metrics: list[dict[str, Any]],
    drift_issues: list[dict[str, Any]],
    summary: dict[str, Any],
) -> str:
    payload = json.dumps(
        {
            "platform_metrics": platform_metrics,
            "meridian_askable_metrics": meridian_askable_metrics,
            "drift_issues": drift_issues,
            "summary": summary,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _synthetic_query_strategy(capability: Any) -> str:
    if capability.template_keys:
        return "template"
    if capability.service_keys:
        return "service"
    return "synthetic"


def _entity_key_for_grain(natural_grain: str) -> str | None:
    if natural_grain.startswith("fund"):
        return "fund"
    if natural_grain.startswith("asset"):
        return "asset"
    if natural_grain.startswith("portfolio"):
        return "fund"
    return None
