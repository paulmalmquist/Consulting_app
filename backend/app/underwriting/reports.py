from __future__ import annotations

import json
from typing import Any


def _money(cents: int | float | None) -> str:
    if cents is None:
        return "n/a"
    return f"${(float(cents) / 100.0):,.0f}"


def _pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.2f}%"


def generate_sources_ledger_markdown(*, sources: list[dict[str, Any]]) -> str:
    lines = [
        "# Sources Ledger",
        "",
        "| Citation | Title | Publisher | Accessed | URL | Excerpt Hash |",
        "|---|---|---|---|---|---|",
    ]
    for src in sources:
        lines.append(
            "| {citation} | {title} | {publisher} | {accessed} | {url} | `{hashv}` |".format(
                citation=src.get("citation_key", ""),
                title=(src.get("title") or "").replace("|", " "),
                publisher=(src.get("publisher") or "").replace("|", " "),
                accessed=src.get("date_accessed") or "",
                url=src.get("url") or "",
                hashv=src.get("excerpt_hash") or "",
            )
        )
    return "\n".join(lines)


def generate_outputs_markdown(*, result: dict[str, Any]) -> str:
    valuation = result.get("valuation") or {}
    returns = result.get("returns") or {}
    debt = result.get("debt") or {}

    return "\n".join(
        [
            "# Model Outputs",
            "",
            "## Valuation",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| Stabilized NOI | {_money(valuation.get('stabilized_noi_cents'))} |",
            f"| Direct Cap Value | {_money(valuation.get('direct_cap_value_cents'))} |",
            f"| Gross Exit Value | {_money(valuation.get('gross_exit_value_cents'))} |",
            f"| Net Exit Value | {_money(valuation.get('net_exit_value_cents'))} |",
            "",
            "## Returns",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| Levered IRR | {_pct(returns.get('levered_irr'))} |",
            f"| Unlevered IRR | {_pct(returns.get('unlevered_irr'))} |",
            f"| Equity Multiple | {returns.get('equity_multiple')} |",
            f"| NPV | {_money(returns.get('npv_cents'))} |",
            "",
            "## Debt",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| Loan Amount | {_money(debt.get('loan_amount_cents'))} |",
            f"| Debt Rate | {_pct(debt.get('debt_rate_pct'))} |",
            f"| Min DSCR | {debt.get('min_dscr')} |",
            f"| Balloon Balance | {_money(debt.get('balloon_balance_cents'))} |",
        ]
    )


def generate_ic_memo_markdown(
    *,
    run_context: dict[str, Any],
    scenario: dict[str, Any],
    result: dict[str, Any],
    assumptions: dict[str, Any],
    market_snapshot: dict[str, Any],
    comp_summary: dict[str, Any],
) -> str:
    returns = result.get("returns") or {}
    valuation = result.get("valuation") or {}

    assumptions_rows = []
    for key in [
        "rent_growth_pct",
        "vacancy_pct",
        "entry_cap_pct",
        "exit_cap_pct",
        "expense_growth_pct",
        "debt_rate_pct",
        "ltv",
    ]:
        val = assumptions.get(key)
        if key.endswith("_pct") or key in {"ltv"}:
            display = _pct(float(val)) if val is not None else "n/a"
        else:
            display = str(val)
        assumptions_rows.append(f"| {key} | {display} |")

    recommendation = result.get("recommendation") or "pass"

    return "\n".join(
        [
            "# Investment Committee Memo",
            "",
            f"## Property Overview",
            f"- Property: **{run_context.get('property_name', 'n/a')}**",
            f"- Type: **{run_context.get('property_type', 'n/a')}**",
            f"- Submarket: **{run_context.get('submarket') or 'n/a'}**",
            f"- Scenario: **{scenario.get('name', 'n/a')}**",
            "",
            "## Market Thesis",
            f"- Market vacancy: {_pct(market_snapshot.get('vacancy_rate'))}",
            f"- Market cap rate: {_pct(market_snapshot.get('cap_rate'))}",
            f"- Rent growth outlook: {_pct(market_snapshot.get('rent_growth_pct'))}",
            "",
            "## Comps Summary",
            f"- Sale comps considered: {comp_summary.get('sale_count', 0)}",
            f"- Lease comps considered: {comp_summary.get('lease_count', 0)}",
            "",
            "## Underwriting Assumptions",
            "| Assumption | Value |",
            "|---|---|",
            *assumptions_rows,
            "",
            "## Valuation + Returns",
            f"- Direct cap value: {_money(valuation.get('direct_cap_value_cents'))}",
            f"- Levered IRR: {_pct(returns.get('levered_irr'))}",
            f"- Equity multiple: {returns.get('equity_multiple')}",
            "",
            "## Key Risks + Mitigations",
            "- Leasing velocity downside can compress NOI; monitor vacancy and leasing concessions monthly.",
            "- Exit cap expansion risk mitigated through conservative debt structure and stress-tested sensitivities.",
            "",
            "## Recommendation",
            f"**{recommendation.upper()}**",
        ]
    )


def generate_appraisal_narrative_markdown(
    *,
    run_context: dict[str, Any],
    scenario: dict[str, Any],
    result: dict[str, Any],
    assumptions: dict[str, Any],
    comp_summary: dict[str, Any],
) -> str:
    valuation = result.get("valuation") or {}

    return "\n".join(
        [
            "# Appraisal-Style Narrative",
            "",
            "## Property Description",
            f"{run_context.get('property_name', 'n/a')} is analyzed as a {run_context.get('property_type', 'n/a')} asset under the {scenario.get('name', 'n/a')} scenario.",
            "",
            "## Market Analysis",
            f"Comparable evidence includes {comp_summary.get('sale_count', 0)} sale comp(s) and {comp_summary.get('lease_count', 0)} lease comp(s).",
            "",
            "## Highest & Best Use",
            "The current use is considered legally permissible, physically possible, financially feasible, and maximally productive under the selected assumptions.",
            "",
            "## Valuation Approaches",
            "### Income Approach",
            f"Direct capitalization indicates value near {_money(valuation.get('direct_cap_value_cents'))} based on stabilized NOI.",
            "",
            "### Sales Comparison Approach",
            "Market comp evidence was normalized and deduplicated with citation-backed provenance for each retained comparable.",
            "",
            "### Cost Approach",
            "Cost approach is not primary in this v1 workflow unless explicitly required by assignment scope.",
            "",
            "## Reconciliation",
            "Reconciliation weights the income approach as primary and checks reasonableness versus cited market/sales evidence.",
            "",
            "## Assumption Context",
            "```json",
            json.dumps(assumptions, indent=2, sort_keys=True),
            "```",
        ]
    )


def generate_report_bundle(
    *,
    run_context: dict[str, Any],
    scenario: dict[str, Any],
    result: dict[str, Any],
    assumptions: dict[str, Any],
    market_snapshot: dict[str, Any],
    sale_comps: list[dict[str, Any]],
    lease_comps: list[dict[str, Any]],
    sources: list[dict[str, Any]],
) -> dict[str, Any]:
    comp_summary = {
        "sale_count": len(sale_comps),
        "lease_count": len(lease_comps),
    }

    ic_memo_md = generate_ic_memo_markdown(
        run_context=run_context,
        scenario=scenario,
        result=result,
        assumptions=assumptions,
        market_snapshot=market_snapshot,
        comp_summary=comp_summary,
    )
    appraisal_md = generate_appraisal_narrative_markdown(
        run_context=run_context,
        scenario=scenario,
        result=result,
        assumptions=assumptions,
        comp_summary=comp_summary,
    )
    outputs_md = generate_outputs_markdown(result=result)
    sources_ledger_md = generate_sources_ledger_markdown(sources=sources)

    outputs_json = {
        "run": run_context,
        "scenario": scenario,
        "assumptions": assumptions,
        "market_snapshot": market_snapshot,
        "results": result,
        "comp_summary": comp_summary,
        "citations": [s.get("citation_key") for s in sources],
    }

    return {
        "ic_memo_md": ic_memo_md,
        "appraisal_md": appraisal_md,
        "outputs_md": outputs_md,
        "sources_ledger_md": sources_ledger_md,
        "outputs_json": outputs_json,
    }
