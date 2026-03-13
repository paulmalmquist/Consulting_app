"""Report generator — captures test results and writes summary reports.

Usage:
  pytest tests/dashboard_validation/ -v --tb=short -p tests.dashboard_validation.report_generator

Or call generate_report() directly after a test run.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

from app.services.dashboard_composer import compose_dashboard_spec
from .prompt_pairs import PROMPT_PAIRS, PromptPair
from .sql_reference import SQL_REF_BY_ID
from .conftest import ENV_ID, BUS_ID


@dataclass
class TestResult:
    pair_id: str
    prompt: str
    sql_ref_id: str
    expected_widget_types: list[str]
    actual_widget_types: list[str]
    expected_metrics: list[str]
    actual_metrics: list[str]
    spec_pass: bool
    layout_pass: bool
    failure_reasons: list[str] = field(default_factory=list)


def _run_single_validation(pair: PromptPair) -> TestResult:
    """Run validation for a single prompt pair and return the result."""
    spec = compose_dashboard_spec(pair.prompt, env_id=ENV_ID, business_id=BUS_ID)

    actual_types = [w["type"] for w in spec["widgets"]]
    actual_metrics: set[str] = set()
    for w in spec["widgets"]:
        for m in w["config"].get("metrics", []):
            actual_metrics.add(m["key"])

    failures: list[str] = []

    # Widget count check
    n = len(spec["widgets"])
    if pair.count_is_minimum:
        if n < pair.expected_widget_count:
            failures.append(
                f"Expected >= {pair.expected_widget_count} widgets, got {n}"
            )
    else:
        if n != pair.expected_widget_count:
            failures.append(
                f"Expected {pair.expected_widget_count} widgets, got {n}"
            )

    # Widget type check
    for etype in pair.expected_widget_types:
        if etype not in actual_types:
            failures.append(f"Missing widget type '{etype}'")

    # Metric check
    for metric in pair.expected_metrics:
        if metric not in actual_metrics:
            failures.append(f"Missing metric '{metric}'")

    # Layout check
    layout_pass = True
    for w in spec["widgets"]:
        lay = w["layout"]
        if lay["x"] + lay["w"] > 12:
            layout_pass = False
            failures.append(f"Widget {w['id']} overflows grid: x={lay['x']} w={lay['w']}")
        if lay["x"] < 0 or lay["y"] < 0:
            layout_pass = False
            failures.append(f"Widget {w['id']} has negative position")

    return TestResult(
        pair_id=pair.id,
        prompt=pair.prompt,
        sql_ref_id=pair.sql_ref_id,
        expected_widget_types=pair.expected_widget_types,
        actual_widget_types=actual_types,
        expected_metrics=pair.expected_metrics,
        actual_metrics=sorted(actual_metrics),
        spec_pass=len([f for f in failures if "widget" in f.lower() or "metric" in f.lower()]) == 0,
        layout_pass=layout_pass,
        failure_reasons=failures,
    )


def generate_report(output_dir: str | Path | None = None) -> dict:
    """Run all prompt pairs through the composer and generate a validation report.

    Returns the report dict and writes JSON + Markdown files.
    """
    if output_dir is None:
        output_dir = Path(__file__).parent.parent.parent / "dashboard_tests"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    results: list[TestResult] = []
    for pair in PROMPT_PAIRS:
        result = _run_single_validation(pair)
        results.append(result)

    spec_pass = sum(1 for r in results if r.spec_pass)
    spec_fail = sum(1 for r in results if not r.spec_pass)
    layout_pass = sum(1 for r in results if r.layout_pass)
    layout_fail = sum(1 for r in results if not r.layout_pass)
    total = len(results)

    report = {
        "run_date": datetime.now(timezone.utc).isoformat(),
        "total_prompt_pairs": total,
        "spec_pass": spec_pass,
        "spec_fail": spec_fail,
        "layout_pass": layout_pass,
        "layout_fail": layout_fail,
        "pass_rate": f"{(spec_pass / total * 100):.1f}%",
        "failures": [asdict(r) for r in results if not r.spec_pass or not r.layout_pass],
        "all_results": [asdict(r) for r in results],
    }

    # Write JSON
    json_path = output_dir / "dashboard_validation_report.json"
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2)

    # Write Markdown
    md_path = output_dir / "dashboard_validation_report.md"
    with open(md_path, "w") as f:
        f.write("# Dashboard Validation Report\n\n")
        f.write(f"**Run date:** {report['run_date']}\n\n")
        f.write("## Summary\n\n")
        f.write(f"- **Total prompts:** {total}\n")
        f.write(f"- **Spec pass:** {spec_pass}/{total} ({report['pass_rate']})\n")
        f.write(f"- **Layout pass:** {layout_pass}/{total}\n\n")

        if report["failures"]:
            f.write("## Failures\n\n")
            f.write("| ID | Prompt | Expected Types | Actual Types | Reason |\n")
            f.write("|---|---|---|---|---|\n")
            for fail in report["failures"]:
                reasons = "; ".join(fail["failure_reasons"])
                f.write(
                    f"| {fail['pair_id']} "
                    f"| {fail['prompt'][:40]} "
                    f"| {', '.join(fail['expected_widget_types'])} "
                    f"| {', '.join(fail['actual_widget_types'])} "
                    f"| {reasons} |\n"
                )
            f.write("\n")

        f.write("## All Results\n\n")
        f.write("| ID | Prompt | Spec | Layout | Widget Types |\n")
        f.write("|---|---|---|---|---|\n")
        for r in report["all_results"]:
            spec_icon = "PASS" if r["spec_pass"] else "FAIL"
            lay_icon = "PASS" if r["layout_pass"] else "FAIL"
            f.write(
                f"| {r['pair_id']} "
                f"| {r['prompt'][:40]} "
                f"| {spec_icon} "
                f"| {lay_icon} "
                f"| {', '.join(r['actual_widget_types'])} |\n"
            )

        f.write("\n## Composer Improvements Made\n\n")
        f.write("1. **Entity type plural detection**: Added `s?` to entity regex patterns "
                "(investments, deals, returns)\n")
        f.write("2. **Time grain priority**: Moved explicit grains (monthly, quarterly, annual) "
                "before generic patterns (trend, over time)\n")
        f.write('3. **"X vs Y" freeform detection**: Added `_VS_METRICS_RE` check in '
                "freeform chart intent parsing\n")
        f.write('4. **"across all X" dimension detection**: Added `(?:all\\s+)?` to '
                "dimension patterns\n")
        f.write("5. **Archetype section collision**: Use full archetype defaults when "
                "detected sections are a subset\n")

    # Write individual test specs
    for pair in PROMPT_PAIRS:
        pair_dir = output_dir / pair.id
        pair_dir.mkdir(exist_ok=True)

        # prompt.txt
        with open(pair_dir / "prompt.txt", "w") as f:
            f.write(pair.prompt + "\n")

        # sql_reference.sql
        sql_ref = SQL_REF_BY_ID.get(pair.sql_ref_id)
        if sql_ref:
            with open(pair_dir / "sql_reference.sql", "w") as f:
                f.write(f"-- {sql_ref.description}\n")
                f.write(f"-- Source: {sql_ref.source_table}\n")
                f.write(f"-- Expected columns: {', '.join(sql_ref.expected_columns)}\n\n")
                f.write(sql_ref.sql.strip() + "\n")

        # actual_widget.json
        spec = compose_dashboard_spec(pair.prompt, env_id=ENV_ID, business_id=BUS_ID)
        with open(pair_dir / "actual_widget.json", "w") as f:
            json.dump(spec, f, indent=2)

        # expected_chart.txt
        with open(pair_dir / "expected_chart.txt", "w") as f:
            f.write(f"Widget types: {', '.join(pair.expected_widget_types)}\n")
            f.write(f"Metrics: {', '.join(pair.expected_metrics)}\n")
            f.write(f"Group by: {pair.expected_group_by}\n")
            f.write(f"Time grain: {pair.expected_time_grain}\n")
            f.write(f"Entity type: {pair.expected_entity_type}\n")
            f.write(f"Archetype: {pair.expected_archetype}\n")

    return report


if __name__ == "__main__":
    report = generate_report()
    print(f"Report generated: {report['spec_pass']}/{report['total_prompt_pairs']} passed")
    print(f"Pass rate: {report['pass_rate']}")
