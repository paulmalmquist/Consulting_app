"""Dry-run bootstrapper for execution engine v1.

This script is filesystem-only and does not connect to any database.
It generates canonical schema specs, capability manifests, and a
certification checklist for a tenant environment.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List
from uuid import uuid5, NAMESPACE_URL


CANONICAL_TABLE_SPECS: Dict[str, Dict] = {
    "tenant": {
        "primary_key": ["tenant_id"],
        "grain": "one row per tenant",
        "immutability": "mutable_admin_fields",
    },
    "environment": {
        "primary_key": ["environment_id"],
        "foreign_keys": [{"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"}],
        "grain": "one row per tenant environment",
        "immutability": "mutable_status",
    },
    "dataset_version": {
        "primary_key": ["dataset_version_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "environment_id", "ref_table": "environment", "ref_column": "environment_id"},
        ],
        "grain": "one row per dataset snapshot",
        "immutability": "append_only",
    },
    "rule_version": {
        "primary_key": ["rule_version_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "environment_id", "ref_table": "environment", "ref_column": "environment_id"},
        ],
        "grain": "one row per rule bundle version",
        "immutability": "append_only",
    },
    "run": {
        "primary_key": ["run_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "environment_id", "ref_table": "environment", "ref_column": "environment_id"},
            {"column": "dataset_version_id", "ref_table": "dataset_version", "ref_column": "dataset_version_id"},
            {"column": "rule_version_id", "ref_table": "rule_version", "ref_column": "rule_version_id"},
        ],
        "grain": "one row per execution run",
        "immutability": "append_only_identity",
        "required_lineage": ["run_id", "dataset_version_id", "rule_version_id"],
    },
    "fund": {
        "primary_key": ["fund_id"],
        "foreign_keys": [{"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"}],
        "grain": "one row per fund",
        "immutability": "scd2",
    },
    "deal": {
        "primary_key": ["deal_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "fund_id", "ref_table": "fund", "ref_column": "fund_id"},
        ],
        "grain": "one row per deal",
        "immutability": "scd2",
    },
    "asset": {
        "primary_key": ["asset_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "deal_id", "ref_table": "deal", "ref_column": "deal_id"},
        ],
        "grain": "one row per asset",
        "immutability": "scd2",
    },
    "investor": {
        "primary_key": ["investor_id"],
        "foreign_keys": [{"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"}],
        "grain": "one row per investor",
        "immutability": "scd2",
    },
    "commitment": {
        "primary_key": ["commitment_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "fund_id", "ref_table": "fund", "ref_column": "fund_id"},
            {"column": "investor_id", "ref_table": "investor", "ref_column": "investor_id"},
        ],
        "grain": "one row per investor commitment",
        "immutability": "append_only",
    },
    "cash_ledger_entry": {
        "primary_key": ["cash_ledger_entry_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "fund_id", "ref_table": "fund", "ref_column": "fund_id"},
            {"column": "deal_id", "ref_table": "deal", "ref_column": "deal_id"},
            {"column": "asset_id", "ref_table": "asset", "ref_column": "asset_id"},
            {"column": "investor_id", "ref_table": "investor", "ref_column": "investor_id"},
            {"column": "dataset_version_id", "ref_table": "dataset_version", "ref_column": "dataset_version_id"},
        ],
        "grain": "one cash event line",
        "immutability": "append_only_with_reversals",
        "required_lineage": ["dataset_version_id"],
    },
    "waterfall_definition": {
        "primary_key": ["waterfall_definition_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "fund_id", "ref_table": "fund", "ref_column": "fund_id"},
            {"column": "rule_version_id", "ref_table": "rule_version", "ref_column": "rule_version_id"},
        ],
        "grain": "one waterfall definition version",
        "immutability": "append_only",
    },
    "waterfall_tier": {
        "primary_key": ["waterfall_tier_id"],
        "foreign_keys": [
            {
                "column": "waterfall_definition_id",
                "ref_table": "waterfall_definition",
                "ref_column": "waterfall_definition_id",
            }
        ],
        "grain": "one tier per waterfall definition",
        "immutability": "append_only",
    },
    "waterfall_run_result": {
        "primary_key": ["waterfall_run_result_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "run_id", "ref_table": "run", "ref_column": "run_id"},
            {
                "column": "waterfall_definition_id",
                "ref_table": "waterfall_definition",
                "ref_column": "waterfall_definition_id",
            },
            {"column": "dataset_version_id", "ref_table": "dataset_version", "ref_column": "dataset_version_id"},
            {"column": "rule_version_id", "ref_table": "rule_version", "ref_column": "rule_version_id"},
        ],
        "grain": "one result per run x definition x scope",
        "immutability": "append_only",
        "required_lineage": ["run_id", "dataset_version_id", "rule_version_id"],
    },
    "waterfall_allocation_line": {
        "primary_key": ["waterfall_allocation_line_id"],
        "foreign_keys": [
            {
                "column": "waterfall_run_result_id",
                "ref_table": "waterfall_run_result",
                "ref_column": "waterfall_run_result_id",
            },
            {"column": "investor_id", "ref_table": "investor", "ref_column": "investor_id"},
            {"column": "waterfall_tier_id", "ref_table": "waterfall_tier", "ref_column": "waterfall_tier_id"},
        ],
        "grain": "one allocation per run result x investor x tier",
        "immutability": "append_only",
        "required_lineage": ["run_id", "dataset_version_id", "rule_version_id"],
    },
    "certification": {
        "primary_key": ["certification_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "environment_id", "ref_table": "environment", "ref_column": "environment_id"},
            {"column": "run_id", "ref_table": "run", "ref_column": "run_id"},
            {"column": "dataset_version_id", "ref_table": "dataset_version", "ref_column": "dataset_version_id"},
            {"column": "rule_version_id", "ref_table": "rule_version", "ref_column": "rule_version_id"},
        ],
        "grain": "one certification decision per run",
        "immutability": "append_only",
        "required_lineage": ["run_id", "dataset_version_id", "rule_version_id"],
    },
    "certified_output_pointer": {
        "primary_key": ["certified_output_pointer_id"],
        "foreign_keys": [
            {"column": "tenant_id", "ref_table": "tenant", "ref_column": "tenant_id"},
            {"column": "certification_id", "ref_table": "certification", "ref_column": "certification_id"},
            {"column": "run_id", "ref_table": "run", "ref_column": "run_id"},
        ],
        "grain": "one pointer per certified output",
        "immutability": "append_only",
        "required_lineage": ["run_id"],
    },
}


INDUSTRY_PACKS: Dict[str, Dict[str, List[str]]] = {
    "pe_real_estate": {
        "required_tables": [
            "tenant",
            "environment",
            "dataset_version",
            "rule_version",
            "run",
            "fund",
            "deal",
            "asset",
            "investor",
            "commitment",
            "cash_ledger_entry",
            "waterfall_definition",
            "waterfall_tier",
            "waterfall_run_result",
            "waterfall_allocation_line",
            "certification",
            "certified_output_pointer",
        ],
        "default_capabilities": ["accounting", "cashflow", "waterfall"],
    }
}


CAPABILITY_LIBRARY: Dict[str, Dict] = {
    "accounting": {
        "capability_id": "accounting.close",
        "capability_version": "1.0.0",
        "inputs": ["cash_ledger_entry"],
        "outputs": ["certification"],
    },
    "cashflow": {
        "capability_id": "cashflow.ledger",
        "capability_version": "1.0.0",
        "inputs": ["cash_ledger_entry", "commitment"],
        "outputs": ["cash_ledger_entry"],
    },
    "waterfall": {
        "capability_id": "waterfall.allocate",
        "capability_version": "1.0.0",
        "inputs": ["cash_ledger_entry", "waterfall_definition", "waterfall_tier", "commitment"],
        "outputs": ["waterfall_run_result", "waterfall_allocation_line", "certified_output_pointer"],
    },
}


REQUIRED_LINEAGE = ["tenant_id", "environment_id", "run_id", "dataset_version_id", "rule_version_id", "code_version"]


@dataclass(frozen=True)
class RunEnvelope:
    tenant_code: str
    environment_name: str
    industry_code: str
    as_of_date: str
    run_id: str
    dataset_version_id: str
    rule_version_id: str
    code_version: str = "dry-run"


def deterministic_id(*parts: str) -> str:
    """Create a deterministic UUID5 based on the provided parts."""
    name = "::".join(parts)
    return str(uuid5(NAMESPACE_URL, name))


def build_run_envelope(tenant_code: str, environment_name: str, industry_code: str, as_of_date: str) -> RunEnvelope:
    run_id = deterministic_id("run", tenant_code, environment_name, industry_code, as_of_date)
    dataset_version_id = deterministic_id("dataset", tenant_code, environment_name, as_of_date)
    rule_version_id = deterministic_id("rule", tenant_code, environment_name, industry_code)
    return RunEnvelope(
        tenant_code=tenant_code,
        environment_name=environment_name,
        industry_code=industry_code,
        as_of_date=as_of_date,
        run_id=run_id,
        dataset_version_id=dataset_version_id,
        rule_version_id=rule_version_id,
    )


def ensure_known_industry(industry_code: str) -> Dict[str, List[str]]:
    if industry_code not in INDUSTRY_PACKS:
        known = ", ".join(sorted(INDUSTRY_PACKS))
        raise SystemExit(f"Unknown industry_code '{industry_code}'. Known: {known}")
    return INDUSTRY_PACKS[industry_code]


def resolve_capabilities(industry_pack: Dict[str, List[str]], selected_capabilities: List[str]) -> List[str]:
    capabilities = selected_capabilities or industry_pack["default_capabilities"]
    unknown = sorted(set(capabilities) - set(CAPABILITY_LIBRARY))
    if unknown:
        raise SystemExit(f"Unknown capabilities requested: {unknown}")
    return capabilities


def write_json(path: Path, payload: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def emit_schema_specs(base_dir: Path, required_tables: List[str]) -> None:
    schema_dir = base_dir / "schema"
    for table_name in sorted(required_tables):
        spec = CANONICAL_TABLE_SPECS[table_name]
        payload = {"table_name": table_name, **spec}
        write_json(schema_dir / f"{table_name}.json", payload)


def emit_capability_manifests(base_dir: Path, capabilities: List[str], envelope: RunEnvelope) -> None:
    manifests_dir = base_dir / "manifests"
    for capability in sorted(capabilities):
        library_entry = CAPABILITY_LIBRARY[capability]
        payload = {
            "capability_key": capability,
            "contract": library_entry,
            "execution_binding": {
                "required_lineage": REQUIRED_LINEAGE,
                "bound_run": asdict(envelope),
            },
            "inputs": library_entry["inputs"],
            "outputs": library_entry["outputs"],
            "replay_guarantee": {
                "deterministic_ids": True,
                "lineage_required": True,
            },
        }
        write_json(manifests_dir / f"{capability}.manifest.json", payload)


def emit_certification_checklist(base_dir: Path, capabilities: List[str]) -> None:
    checklist_dir = base_dir / "certification"
    steps = [
        "Confirm dataset_version is certified or explicitly marked candidate.",
        "Confirm rule_version is certified or explicitly marked candidate.",
        "Validate required lineage fields on all outputs.",
        "Run capability invariants at error severity; all must pass.",
        "Run parity checks where parity_mode is required.",
        "Register certified_output_pointer entries for nlq_allowed outputs.",
        "Record certification decision with references to run_id, dataset_version_id, rule_version_id.",
    ]
    payload = {
        "checklist_version": "v1",
        "capabilities_in_scope": sorted(capabilities),
        "steps": steps,
    }
    write_json(checklist_dir / "certification_checklist.json", payload)


def emit_logs(base_dir: Path, envelope: RunEnvelope, capabilities: List[str], required_tables: List[str]) -> None:
    logs_dir = base_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / "bootstrap.log"
    lines = [
        "bootstrap_v1_dry_run start",
        f"timestamp_utc={datetime.now(timezone.utc).isoformat()}",
        f"tenant_code={envelope.tenant_code}",
        f"environment_name={envelope.environment_name}",
        f"industry_code={envelope.industry_code}",
        f"as_of_date={envelope.as_of_date}",
        f"run_id={envelope.run_id}",
        f"dataset_version_id={envelope.dataset_version_id}",
        f"rule_version_id={envelope.rule_version_id}",
        f"capabilities={sorted(capabilities)}",
        f"required_tables={sorted(required_tables)}",
        "bootstrap_v1_dry_run complete",
    ]
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dry-run bootstrapper for execution engine v1")
    parser.add_argument("--tenant-code", default="demo_tenant")
    parser.add_argument("--environment-name", default="uat")
    parser.add_argument("--industry-code", default="pe_real_estate")
    parser.add_argument("--capability", dest="capabilities", action="append", default=[])
    parser.add_argument("--as-of-date", default="2026-01-01")
    parser.add_argument(
        "--output-dir",
        default="artifacts/bootstrap_v1",
        help="Base directory for generated artifacts",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    industry_pack = ensure_known_industry(args.industry_code)
    capabilities = resolve_capabilities(industry_pack, args.capabilities)
    required_tables = industry_pack["required_tables"]

    envelope = build_run_envelope(
        tenant_code=args.tenant_code,
        environment_name=args.environment_name,
        industry_code=args.industry_code,
        as_of_date=args.as_of_date,
    )

    base_dir = Path(args.output_dir) / args.tenant_code / args.environment_name
    base_dir.mkdir(parents=True, exist_ok=True)

    emit_schema_specs(base_dir, required_tables)
    emit_capability_manifests(base_dir, capabilities, envelope)
    emit_certification_checklist(base_dir, capabilities)
    emit_logs(base_dir, envelope, capabilities, required_tables)

    run_envelope_path = base_dir / "run_envelope.json"
    write_json(run_envelope_path, asdict(envelope))

    print("Dry run bootstrap complete.")
    print(f"Artifacts written to: {base_dir}")
    print(f"run_id={envelope.run_id}")
    print(f"dataset_version_id={envelope.dataset_version_id}")
    print(f"rule_version_id={envelope.rule_version_id}")


if __name__ == "__main__":
    main()
