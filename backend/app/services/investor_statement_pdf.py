"""Investor quarterly statement generator.

Produces HTML-formatted investor statements suitable for PDF conversion
(via browser print) or direct viewing. All CSS is inlined so the document
is fully self-contained.
"""
from __future__ import annotations

from decimal import Decimal
from datetime import date
from typing import Any


def _d(val: Any) -> Decimal:
    """Coerce a value to Decimal, defaulting to zero."""
    if val is None:
        return Decimal("0")
    return Decimal(str(val))


def _fmt_money(val: Any) -> str:
    """Format a numeric value as a human-readable dollar amount."""
    d = _d(val)
    if d >= 1_000_000:
        return f"${d / 1_000_000:,.1f}M"
    if d >= 1_000:
        return f"${d / 1_000:,.0f}K"
    return f"${d:,.0f}"


def _fmt_money_full(val: Any) -> str:
    """Format a numeric value as a full dollar amount with commas."""
    d = _d(val)
    return f"${d:,.2f}"


def _fmt_pct(val: Any) -> str:
    """Format a decimal as a percentage string."""
    if val is None:
        return "\u2014"
    return f"{float(val) * 100:.1f}%"


def _fmt_mult(val: Any) -> str:
    """Format a value as a multiple (e.g. 1.45x)."""
    if val is None:
        return "\u2014"
    return f"{float(val):.2f}x"


def _fmt_date(val: Any) -> str:
    """Format a date or date-string for display."""
    if val is None:
        return "\u2014"
    if isinstance(val, date):
        return val.strftime("%b %d, %Y")
    # Assume ISO string
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        return dt.strftime("%b %d, %Y")
    except (ValueError, TypeError):
        return str(val)


def _quarter_label(quarter: str) -> str:
    """Convert '2026Q1' to 'Q1 2026'."""
    if len(quarter) == 6 and "Q" in quarter:
        year = quarter[:4]
        q = quarter[4:]
        return f"{q} {year}"
    return quarter


_STYLES = """
<style>
  @page {
    size: letter;
    margin: 1in;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #1a1a2e;
    line-height: 1.5;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 32px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #0f172a;
    padding-bottom: 20px;
    margin-bottom: 32px;
  }
  .letterhead-left h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  .letterhead-left p {
    font-size: 13px;
    color: #64748b;
    margin-top: 2px;
  }
  .letterhead-right {
    text-align: right;
    font-size: 13px;
    color: #475569;
  }
  .letterhead-right .quarter {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    font-weight: 600;
    color: #0f172a;
  }
  .partner-header {
    margin-bottom: 28px;
    padding: 16px 20px;
    background: #f8fafc;
    border-radius: 6px;
    border-left: 4px solid #0f172a;
  }
  .partner-header h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
  }
  .partner-header .partner-type {
    font-size: 12px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }
  .section {
    margin-bottom: 28px;
    page-break-inside: avoid;
  }
  .section h3 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  thead th {
    background: #f1f5f9;
    font-weight: 600;
    text-align: left;
    padding: 8px 12px;
    border-bottom: 2px solid #cbd5e1;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #475569;
  }
  thead th.numeric {
    text-align: right;
  }
  tbody td {
    padding: 7px 12px;
    border-bottom: 1px solid #e2e8f0;
    color: #334155;
  }
  tbody td.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tbody td.bold {
    font-weight: 600;
    color: #0f172a;
  }
  tbody tr:nth-child(even) {
    background: #f8fafc;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .kpi-card {
    padding: 12px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    text-align: center;
  }
  .kpi-card .kpi-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    margin-bottom: 4px;
  }
  .kpi-card .kpi-value {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
  }
  .disclaimer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #94a3b8;
    line-height: 1.6;
  }
  .generated-date {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 8px;
    text-align: right;
  }
  @media print {
    body { padding: 0; }
    .section { page-break-inside: avoid; }
  }
</style>
"""


def generate_investor_statement_html(
    partner: dict[str, Any],
    fund: dict[str, Any],
    quarter: str,
    commitments: list[dict[str, Any]],
    metrics: dict[str, Any] | None,
    capital_activity: list[dict[str, Any]],
) -> str:
    """Generate a professional HTML investor statement.

    Parameters
    ----------
    partner : dict
        Partner record with ``name``, ``partner_type``.
    fund : dict
        Fund record with ``fund_name`` (or ``name``), ``vintage_year``, ``strategy``.
    quarter : str
        Quarter identifier, e.g. ``"2026Q1"``.
    commitments : list[dict]
        Commitment rows, each with ``fund_name``, ``committed_amount``, ``commitment_date``.
    metrics : dict or None
        Quarter metrics with ``contributed_to_date``, ``distributed_to_date``,
        ``nav``, ``dpi``, ``tvpi``, ``irr``.
    capital_activity : list[dict]
        Ledger entries with ``effective_date``, ``entry_type``, ``amount``, ``memo``.

    Returns
    -------
    str
        Complete, self-contained HTML document.
    """

    fund_name = fund.get("fund_name") or fund.get("name") or "Fund"
    partner_name = partner.get("name") or "Investor"
    partner_type = (partner.get("partner_type") or "").upper()
    quarter_label = _quarter_label(quarter)

    # ── Capital Account Summary ──────────────────────────────────────
    committed = _d(None)
    for c in commitments:
        if str(c.get("fund_id", "")) == str(fund.get("fund_id", "")) or len(commitments) == 1:
            committed += _d(c.get("committed_amount"))

    contributed = _d(metrics.get("contributed_to_date") or metrics.get("contributed")) if metrics else Decimal("0")
    distributed = _d(metrics.get("distributed_to_date") or metrics.get("distributed")) if metrics else Decimal("0")
    nav = _d(metrics.get("nav") or metrics.get("nav_share")) if metrics else Decimal("0")
    dpi = metrics.get("dpi") if metrics else None
    tvpi = metrics.get("tvpi") if metrics else None
    irr = metrics.get("irr") if metrics else None

    # ── Build HTML ───────────────────────────────────────────────────
    parts: list[str] = []
    parts.append("<!DOCTYPE html>")
    parts.append('<html lang="en">')
    parts.append("<head>")
    parts.append('<meta charset="UTF-8">')
    parts.append('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    parts.append(f"<title>Investor Statement - {partner_name} - {quarter_label}</title>")
    parts.append(_STYLES)
    parts.append("</head>")
    parts.append("<body>")

    # ── Letterhead ───────────────────────────────────────────────────
    vintage = fund.get("vintage_year") or ""
    strategy = fund.get("strategy") or ""
    subtitle_parts = [s for s in [strategy, f"Vintage {vintage}" if vintage else ""] if s]
    subtitle = " | ".join(subtitle_parts)

    parts.append('<div class="letterhead">')
    parts.append('  <div class="letterhead-left">')
    parts.append(f"    <h1>{fund_name}</h1>")
    if subtitle:
        parts.append(f"    <p>{subtitle}</p>")
    parts.append("  </div>")
    parts.append('  <div class="letterhead-right">')
    parts.append(f'    <div class="quarter">{quarter_label}</div>')
    parts.append("    <div>Quarterly Investor Statement</div>")
    parts.append("  </div>")
    parts.append("</div>")

    # ── Partner header ───────────────────────────────────────────────
    parts.append('<div class="partner-header">')
    parts.append(f"  <h2>{partner_name}</h2>")
    if partner_type:
        parts.append(f'  <div class="partner-type">{partner_type} Partner</div>')
    parts.append("</div>")

    # ── KPI Cards ────────────────────────────────────────────────────
    parts.append('<div class="section">')
    parts.append("  <h3>Performance Summary</h3>")
    parts.append('  <div class="kpi-grid">')
    kpi_items = [
        ("DPI", _fmt_mult(dpi)),
        ("TVPI", _fmt_mult(tvpi)),
        ("Net IRR", _fmt_pct(irr)),
        ("NAV", _fmt_money(nav)),
    ]
    for label, value in kpi_items:
        parts.append('    <div class="kpi-card">')
        parts.append(f'      <div class="kpi-label">{label}</div>')
        parts.append(f'      <div class="kpi-value">{value}</div>')
        parts.append("    </div>")
    parts.append("  </div>")
    parts.append("</div>")

    # ── Capital Account Summary Table ────────────────────────────────
    parts.append('<div class="section">')
    parts.append("  <h3>Capital Account Summary</h3>")
    parts.append("  <table>")
    parts.append("    <thead><tr>")
    parts.append('      <th>Item</th><th class="numeric">Amount</th>')
    parts.append("    </tr></thead>")
    parts.append("    <tbody>")

    account_rows = [
        ("Committed Capital", _fmt_money_full(committed)),
        ("Contributed Capital", _fmt_money_full(contributed)),
        ("Distributed Capital", _fmt_money_full(distributed)),
        ("Net Asset Value", _fmt_money_full(nav)),
        ("Unfunded Commitment", _fmt_money_full(committed - contributed)),
    ]
    for label, value in account_rows:
        bold_cls = ' class="bold"' if label == "Net Asset Value" else ""
        parts.append(f"    <tr><td{bold_cls}>{label}</td>")
        parts.append(f'        <td class="numeric{" bold" if label == "Net Asset Value" else ""}">{value}</td></tr>')

    parts.append("    </tbody>")
    parts.append("  </table>")
    parts.append("</div>")

    # ── Performance Metrics Table ────────────────────────────────────
    parts.append('<div class="section">')
    parts.append("  <h3>Performance Metrics</h3>")
    parts.append("  <table>")
    parts.append("    <thead><tr>")
    parts.append('      <th>Metric</th><th class="numeric">Value</th>')
    parts.append("    </tr></thead>")
    parts.append("    <tbody>")

    perf_rows = [
        ("Distributions to Paid-In (DPI)", _fmt_mult(dpi)),
        ("Total Value to Paid-In (TVPI)", _fmt_mult(tvpi)),
        ("Net Internal Rate of Return (IRR)", _fmt_pct(irr)),
        ("Paid-In Percentage", _fmt_pct(float(contributed) / float(committed) if committed else None)),
    ]
    for label, value in perf_rows:
        parts.append(f'    <tr><td>{label}</td><td class="numeric">{value}</td></tr>')

    parts.append("    </tbody>")
    parts.append("  </table>")
    parts.append("</div>")

    # ── Capital Activity Table ───────────────────────────────────────
    if capital_activity:
        parts.append('<div class="section">')
        parts.append(f"  <h3>Capital Activity \u2014 {quarter_label}</h3>")
        parts.append("  <table>")
        parts.append("    <thead><tr>")
        parts.append('      <th>Date</th><th>Type</th><th class="numeric">Amount</th><th>Memo</th>')
        parts.append("    </tr></thead>")
        parts.append("    <tbody>")

        total_activity = Decimal("0")
        for entry in capital_activity:
            amt = _d(entry.get("amount") or entry.get("amount_base"))
            total_activity += amt
            entry_type = (entry.get("entry_type") or "").replace("_", " ").title()
            memo = entry.get("memo") or "\u2014"
            eff_date = _fmt_date(entry.get("effective_date"))
            parts.append(f"    <tr>")
            parts.append(f"      <td>{eff_date}</td>")
            parts.append(f"      <td>{entry_type}</td>")
            parts.append(f'      <td class="numeric">{_fmt_money_full(amt)}</td>')
            parts.append(f"      <td>{memo}</td>")
            parts.append(f"    </tr>")

        # Total row
        parts.append(f'    <tr style="border-top: 2px solid #cbd5e1;">')
        parts.append(f'      <td class="bold" colspan="2">Total</td>')
        parts.append(f'      <td class="numeric bold">{_fmt_money_full(total_activity)}</td>')
        parts.append(f"      <td></td>")
        parts.append(f"    </tr>")

        parts.append("    </tbody>")
        parts.append("  </table>")
        parts.append("</div>")

    # ── Multi-Fund Commitment Summary ────────────────────────────────
    if len(commitments) > 1:
        parts.append('<div class="section">')
        parts.append("  <h3>Cross-Fund Commitment Summary</h3>")
        parts.append("  <table>")
        parts.append("    <thead><tr>")
        parts.append('      <th>Fund</th><th class="numeric">Committed</th><th>Date</th>')
        parts.append("    </tr></thead>")
        parts.append("    <tbody>")

        total_all_funds = Decimal("0")
        for c in commitments:
            c_amt = _d(c.get("committed_amount"))
            total_all_funds += c_amt
            c_fund = c.get("fund_name") or str(c.get("fund_id", ""))
            c_date = _fmt_date(c.get("commitment_date"))
            parts.append(f"    <tr>")
            parts.append(f"      <td>{c_fund}</td>")
            parts.append(f'      <td class="numeric">{_fmt_money_full(c_amt)}</td>')
            parts.append(f"      <td>{c_date}</td>")
            parts.append(f"    </tr>")

        parts.append(f'    <tr style="border-top: 2px solid #cbd5e1;">')
        parts.append(f'      <td class="bold">Total Across Funds</td>')
        parts.append(f'      <td class="numeric bold">{_fmt_money_full(total_all_funds)}</td>')
        parts.append(f"      <td></td>")
        parts.append(f"    </tr>")

        parts.append("    </tbody>")
        parts.append("  </table>")
        parts.append("</div>")

    # ── Disclaimer ───────────────────────────────────────────────────
    today = date.today().strftime("%B %d, %Y")
    parts.append('<div class="disclaimer">')
    parts.append("  <p>")
    parts.append(
        "This statement is provided for informational purposes only and does not "
        "constitute an offer to sell or a solicitation of an offer to buy any securities. "
        "Past performance is not indicative of future results. The information contained "
        "herein is based on data available as of the date of this report and is subject to "
        "change without notice. Net returns are presented after management fees and carried "
        "interest. Actual individual investor returns may vary based on the timing of capital "
        "contributions and distributions. This statement should be read in conjunction with "
        "the fund's audited financial statements and offering memorandum."
    )
    parts.append("  </p>")
    parts.append("</div>")

    parts.append(f'<div class="generated-date">Generated {today}</div>')

    parts.append("</body>")
    parts.append("</html>")

    return "\n".join(parts)
