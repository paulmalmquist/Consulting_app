#!/usr/bin/env python3
"""Roll up a budget.csv into BUDGET.md and print totals.

Reads the line-item schema documented in references/budget_schema.md.
Costs are ranges (unit_cost_low / unit_cost_high). Frequency drives
one-time vs. recurring. Rows missing both unit costs count as 0 and are
listed under "Needs research".

Usage:
    python rollup_budget.py budget.csv                 # print summary
    python rollup_budget.py budget.csv -o BUDGET.md    # also write the report
    python rollup_budget.py budget.csv --years 5       # 5-year TCO (default 3)
"""
import argparse
import csv
import sys
from collections import defaultdict

REQUIRED = [
    "work_item_id", "work_item", "plan_ref", "category", "item", "basis",
    "qty", "unit", "unit_cost_low", "unit_cost_high", "frequency",
    "confidence", "source", "notes",
]


def _num(v):
    v = (v or "").strip().replace(",", "").replace("$", "")
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def money(x):
    return f"${x:,.0f}"


def rng(lo, hi):
    if lo == hi:
        return money(lo)
    return f"{money(lo)} – {money(hi)}"


def load(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            sys.exit(f"budget.csv is missing columns: {', '.join(missing)}\n"
                     f"Expected header: {','.join(REQUIRED)}")
        rows = [r for r in reader if (r.get("work_item_id") or "").strip()]
    return rows


def extend(row):
    """Return (low, high, needs_research) extended cost for a row."""
    qty = _num(row.get("qty")) or 0.0
    lo = _num(row.get("unit_cost_low"))
    hi = _num(row.get("unit_cost_high"))
    needs = lo is None and hi is None
    if lo is None:
        lo = hi if hi is not None else 0.0
    if hi is None:
        hi = lo
    return qty * lo, qty * hi, needs


def annualize(freq, lo, hi):
    """Split an extended cost into (one_time, recurring_annual) low/high."""
    f = (freq or "").strip().lower()
    if f == "one_time":
        return (lo, hi), (0.0, 0.0)
    if f == "monthly":
        return (0.0, 0.0), (lo * 12, hi * 12)
    if f == "annual":
        return (0.0, 0.0), (lo, hi)
    # Unknown frequency: treat as one-time but it will be flagged in notes review.
    return (lo, hi), (0.0, 0.0)


def build_report(rows, years):
    onetime = [0.0, 0.0]
    recurring = [0.0, 0.0]
    by_cat = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])      # ot_lo, ot_hi, rec_lo, rec_hi
    by_item = defaultdict(lambda: {"name": "", "ref": "", "v": [0.0, 0.0, 0.0, 0.0]})
    needs = []

    for r in rows:
        lo, hi, nr = extend(r)
        (ot_lo, ot_hi), (rc_lo, rc_hi) = annualize(r.get("frequency"), lo, hi)
        onetime[0] += ot_lo; onetime[1] += ot_hi
        recurring[0] += rc_lo; recurring[1] += rc_hi

        c = by_cat[r.get("category", "?")]
        c[0] += ot_lo; c[1] += ot_hi; c[2] += rc_lo; c[3] += rc_hi

        wid = r["work_item_id"]
        it = by_item[wid]
        it["name"] = r.get("work_item", "")
        it["ref"] = r.get("plan_ref", "")
        it["v"][0] += ot_lo; it["v"][1] += ot_hi; it["v"][2] += rc_lo; it["v"][3] += rc_hi

        if nr:
            needs.append(r)

    tco = [onetime[0] + years * recurring[0], onetime[1] + years * recurring[1]]

    lines = []
    lines.append("# Budget rollup\n")
    lines.append("> Generated from `budget.csv` by `plan-budget-augmentor`. Do not hand-edit; "
                 "edit `budget.csv` and re-run the rollup script.\n")
    lines.append("## Summary\n")
    lines.append(f"- **One-time (build):** {rng(*onetime)}")
    lines.append(f"- **Recurring (annual):** {rng(*recurring)}")
    lines.append(f"- **{years}-year TCO:** {rng(*tco)}  _(one-time + {years} × annual)_")
    if needs:
        lines.append(f"- **Line items still needing research:** {len(needs)} "
                     f"(not counted in totals above)")
    lines.append("")

    lines.append("## By category\n")
    lines.append("| Category | One-time | Recurring (annual) |")
    lines.append("|---|---|---|")
    for cat in sorted(by_cat):
        v = by_cat[cat]
        lines.append(f"| {cat} | {rng(v[0], v[1])} | {rng(v[2], v[3])} |")
    lines.append("")

    lines.append("## By work item\n")
    lines.append("| ID | Work item | Plan ref | One-time | Recurring (annual) |")
    lines.append("|---|---|---|---|---|")
    for wid in sorted(by_item):
        it = by_item[wid]; v = it["v"]
        lines.append(f"| {wid} | {it['name']} | {it['ref']} | "
                     f"{rng(v[0], v[1])} | {rng(v[2], v[3])} |")
    lines.append("")

    if needs:
        lines.append("## Needs research (no unit price yet)\n")
        lines.append("| ID | Item | Basis | Frequency | Notes |")
        lines.append("|---|---|---|---|---|")
        for r in needs:
            lines.append(f"| {r['work_item_id']} | {r.get('item','')} | "
                         f"{r.get('basis','')} | {r.get('frequency','')} | "
                         f"{r.get('notes','')} |")
        lines.append("")

    lines.append("## All line items\n")
    lines.append("| ID | Category | Item | Basis | Qty | Unit | Unit cost | Freq | Conf | Source |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        lo = _num(r.get("unit_cost_low")); hi = _num(r.get("unit_cost_high"))
        if lo is None and hi is None:
            cost = "—"
        else:
            cost = rng(lo if lo is not None else hi, hi if hi is not None else lo)
        lines.append(f"| {r['work_item_id']} | {r.get('category','')} | {r.get('item','')} | "
                     f"{r.get('basis','')} | {r.get('qty','')} | {r.get('unit','')} | {cost} | "
                     f"{r.get('frequency','')} | {r.get('confidence','')} | {r.get('source','')} |")
    lines.append("")

    summary = (f"One-time {rng(*onetime)} | Recurring/yr {rng(*recurring)} | "
               f"{years}yr TCO {rng(*tco)} | needs-research: {len(needs)}")
    return "\n".join(lines), summary


def main():
    ap = argparse.ArgumentParser(description="Roll up budget.csv into BUDGET.md")
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", help="write the markdown report to this path")
    ap.add_argument("--years", type=int, default=3, help="years for TCO (default 3)")
    args = ap.parse_args()

    rows = load(args.csv_path)
    if not rows:
        sys.exit("No data rows found in budget.csv.")
    report, summary = build_report(rows, args.years)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(report + "\n")
        print(f"Wrote {args.out}")
    print(summary)


if __name__ == "__main__":
    main()
