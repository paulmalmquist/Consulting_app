#!/usr/bin/env python3
"""
Truth parity spec runner.

Executes a single verification spec and generates a receipt folder.

Usage:
    python verification/runners/run_spec.py verification/specs/fund_irr_base.yaml \\
        --fund-id <uuid> --quarter 2026Q2 --env-id <uuid>
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import yaml
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from verification.finance.metrics import TOLERANCES, assert_within_tolerance


class DecimalEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, Decimal):
            return str(o)
        return super().default(o)


def load_spec(spec_path: str) -> dict:
    with open(spec_path) as f:
        return yaml.safe_load(f)


def substitute_vars(spec: dict, variables: dict[str, str]) -> dict:
    """Replace ${VAR} placeholders in spec with actual values."""
    raw = yaml.dump(spec)
    for key, val in variables.items():
        raw = raw.replace(f"${{{key}}}", val)
    return yaml.safe_load(raw)


def run_query_resolver_spec(spec: dict, variables: dict[str, str]) -> dict:
    """Run query resolver test cases — no DB needed, just import the service."""
    from app.services.re_query_resolver import resolve_query
    from uuid import UUID

    biz_str = variables.get("BUSINESS_ID") or "00000000-0000-0000-0000-000000000001"
    env_str = variables.get("ENV_ID") or "00000000-0000-0000-0000-000000000001"
    business_id = UUID(biz_str)
    env_id = UUID(env_str)
    quarter = variables.get("QUARTER", "2026Q2")

    results = []
    for tc in spec.get("test_cases", []):
        input_query = tc["input"]
        result = resolve_query(
            query=input_query,
            business_id=business_id,
            env_id=env_id,
            quarter=quarter,
        )

        assertions = []

        # Check slash command
        if "expected_slash_command" in tc:
            expected = tc["expected_slash_command"]
            actual = result.get("slash_command")
            passed = actual == expected
            assertions.append({
                "check": "slash_command",
                "expected": expected,
                "actual": actual,
                "passed": passed,
            })

        # Check filters
        if "expected_filters" in tc:
            for ef in tc["expected_filters"]:
                matching = [
                    f for f in result.get("filters", [])
                    if f["field"] == ef["field"]
                ]
                if matching:
                    actual_filter = matching[0]
                    op_match = actual_filter["operator"] == ef["operator"]
                    try:
                        val_match = abs(float(actual_filter["value"]) - float(ef["value"])) < 0.001
                    except (ValueError, TypeError):
                        val_match = str(actual_filter["value"]).lower() == str(ef["value"]).lower()
                    passed = op_match and val_match
                    assertions.append({
                        "check": f"filter_{ef['field']}",
                        "expected": ef,
                        "actual": actual_filter,
                        "passed": passed,
                    })
                else:
                    assertions.append({
                        "check": f"filter_{ef['field']}",
                        "expected": ef,
                        "actual": None,
                        "passed": False,
                        "error": f"No filter found for field {ef['field']}",
                    })

        results.append({
            "input": input_query,
            "result": result,
            "assertions": assertions,
            "all_passed": all(a["passed"] for a in assertions),
        })

    return {
        "spec_name": spec["name"],
        "category": spec.get("category", "unknown"),
        "test_cases": results,
        "all_passed": all(r["all_passed"] for r in results),
    }


def generate_receipt(
    spec: dict,
    results: dict,
    receipt_dir: Path,
) -> None:
    """Write receipt files to disk."""
    receipt_dir.mkdir(parents=True, exist_ok=True)

    # Manifest
    manifest = {
        "spec_name": spec["name"],
        "category": spec.get("category", "unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "all_passed": results.get("all_passed", False),
    }
    (receipt_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, cls=DecimalEncoder)
    )

    # Assertions
    (receipt_dir / "assertions.json").write_text(
        json.dumps(results, indent=2, cls=DecimalEncoder)
    )

    # Human-readable receipt
    lines = [
        f"# Verification Receipt: {spec['name']}",
        f"",
        f"**Timestamp:** {manifest['timestamp']}",
        f"**Result:** {'PASS' if results.get('all_passed') else 'FAIL'}",
        f"",
    ]

    if "test_cases" in results:
        lines.append("## Test Cases")
        for tc in results["test_cases"]:
            status = "PASS" if tc["all_passed"] else "FAIL"
            lines.append(f"- [{status}] `{tc['input']}`")
            for a in tc["assertions"]:
                check_status = "PASS" if a["passed"] else "FAIL"
                lines.append(f"  - [{check_status}] {a['check']}")

    (receipt_dir / "receipt.md").write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Run a verification spec")
    parser.add_argument("spec_path", help="Path to YAML spec file")
    parser.add_argument("--fund-id", default="")
    parser.add_argument("--business-id", default="")
    parser.add_argument("--env-id", default="")
    parser.add_argument("--quarter", default="2026Q2")
    parser.add_argument("--output-dir", default=str(ROOT / "verification" / "receipts"))
    args = parser.parse_args()

    variables = {
        "FUND_ID": args.fund_id,
        "BUSINESS_ID": args.business_id,
        "ENV_ID": args.env_id,
        "QUARTER": args.quarter,
    }

    spec = load_spec(args.spec_path)
    spec = substitute_vars(spec, variables)

    category = spec.get("category", "unknown")

    if category == "query_resolver":
        results = run_query_resolver_spec(spec, variables)
    else:
        print(f"Category '{category}' not yet implemented in runner. Available: query_resolver")
        sys.exit(1)

    # Generate receipt
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = spec["name"].lower().replace(" ", "_").replace("—", "").replace("'", "")[:50]
    receipt_dir = Path(args.output_dir) / today / slug

    generate_receipt(spec, results, receipt_dir)

    # Print summary
    if results.get("all_passed"):
        print(f"PASS: {spec['name']}")
    else:
        print(f"FAIL: {spec['name']}")
        if "test_cases" in results:
            for tc in results["test_cases"]:
                if not tc["all_passed"]:
                    print(f"  FAILED: {tc['input']}")
                    for a in tc["assertions"]:
                        if not a["passed"]:
                            print(f"    {a['check']}: expected={a.get('expected')}, actual={a.get('actual')}")

    sys.exit(0 if results.get("all_passed") else 1)


if __name__ == "__main__":
    main()
