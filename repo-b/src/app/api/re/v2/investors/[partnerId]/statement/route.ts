import { getPool } from "@/lib/server/db";

import { fmtDate, fmtMoney, fmtPct } from '@/lib/format-utils';
export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

// ── Formatting helpers ──────────────────────────────────────────────

function fmtMoneyFull(val: string | number | null): string {
  if (val === null || val === undefined) return "$0.00";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "$0.00";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMult(val: string | number | null): string {
  if (val === null || val === undefined) return "\u2014";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "\u2014";
  return `${n.toFixed(2)}x`;
}

function quarterLabel(quarter: string): string {
  if (quarter.length === 6 && quarter.includes("Q")) {
    const year = quarter.slice(0, 4);
    const q = quarter.slice(4);
    return `${q} ${year}`;
  }
  return quarter;
}

// ── HTML generation ─────────────────────────────────────────────────

function generateStatementHtml(
  partner: Record<string, unknown>,
  fund: Record<string, unknown>,
  quarter: string,
  commitments: Record<string, unknown>[],
  metrics: Record<string, unknown> | null,
  capitalActivity: Record<string, unknown>[],
): string {
  const fundName = (fund.fund_name || fund.name || "Fund") as string;
  const partnerName = (partner.name || "Investor") as string;
  const partnerType = ((partner.partner_type || "") as string).toUpperCase();
  const qLabel = quarterLabel(quarter);
  const vintage = fund.vintage_year ? `Vintage ${fund.vintage_year}` : "";
  const strategy = (fund.strategy || "") as string;
  const subtitle = [strategy, vintage].filter(Boolean).join(" | ");

  // Compute capital account values
  let committed = 0;
  for (const c of commitments) {
    if (String(c.fund_id || "") === String(fund.fund_id || "") || commitments.length === 1) {
      committed += parseFloat(c.committed_amount as string) || 0;
    }
  }
  const contributed = parseFloat((metrics?.contributed_to_date || metrics?.contributed || "0") as string) || 0;
  const distributed = parseFloat((metrics?.distributed_to_date || metrics?.distributed || "0") as string) || 0;
  const nav = parseFloat((metrics?.nav || metrics?.nav_share || "0") as string) || 0;
  const dpi = metrics?.dpi != null ? parseFloat(metrics.dpi as string) : null;
  const tvpi = metrics?.tvpi != null ? parseFloat(metrics.tvpi as string) : null;
  const irr = metrics?.irr != null ? parseFloat(metrics.irr as string) : null;
  const paidIn = committed > 0 ? contributed / committed : null;

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ── Activity rows ──────────────────────────────────────────────
  let activityHtml = "";
  if (capitalActivity.length > 0) {
    let totalActivity = 0;
    let rows = "";
    for (const entry of capitalActivity) {
      const amt = parseFloat((entry.amount || entry.amount_base || "0") as string) || 0;
      totalActivity += amt;
      const entryType = ((entry.entry_type || "") as string).replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
      const memo = (entry.memo || "\u2014") as string;
      const effDate = fmtDate(entry.effective_date as string | null);
      rows += `<tr><td>${effDate}</td><td>${entryType}</td><td class="numeric">${fmtMoneyFull(amt)}</td><td>${memo}</td></tr>\n`;
    }
    rows += `<tr style="border-top: 2px solid #cbd5e1;"><td class="bold" colspan="2">Total</td><td class="numeric bold">${fmtMoneyFull(totalActivity)}</td><td></td></tr>`;

    activityHtml = `
<div class="section">
  <h3>Capital Activity \u2014 ${qLabel}</h3>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th class="numeric">Amount</th><th>Memo</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  // ── Multi-fund summary ─────────────────────────────────────────
  let multiFundHtml = "";
  if (commitments.length > 1) {
    let totalAll = 0;
    let rows = "";
    for (const c of commitments) {
      const cAmt = parseFloat((c.committed_amount || "0") as string) || 0;
      totalAll += cAmt;
      const cFund = (c.fund_name || c.fund_id || "") as string;
      const cDate = fmtDate((c.commitment_date || null) as string | null);
      rows += `<tr><td>${cFund}</td><td class="numeric">${fmtMoneyFull(cAmt)}</td><td>${cDate}</td></tr>\n`;
    }
    rows += `<tr style="border-top: 2px solid #cbd5e1;"><td class="bold">Total Across Funds</td><td class="numeric bold">${fmtMoneyFull(totalAll)}</td><td></td></tr>`;

    multiFundHtml = `
<div class="section">
  <h3>Cross-Fund Commitment Summary</h3>
  <table>
    <thead><tr><th>Fund</th><th class="numeric">Committed</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Investor Statement - ${partnerName} - ${qLabel}</title>
<style>
  @page { size: letter; margin: 1in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #1a1a2e; line-height: 1.5; max-width: 800px;
    margin: 0 auto; padding: 40px 32px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .letterhead {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #0f172a; padding-bottom: 20px; margin-bottom: 32px;
  }
  .letterhead-left h1 {
    font-family: Georgia, 'Times New Roman', serif; font-size: 22px;
    font-weight: 700; color: #0f172a; letter-spacing: -0.3px;
  }
  .letterhead-left p { font-size: 13px; color: #64748b; margin-top: 2px; }
  .letterhead-right { text-align: right; font-size: 13px; color: #475569; }
  .letterhead-right .quarter {
    font-family: Georgia, 'Times New Roman', serif; font-size: 18px;
    font-weight: 600; color: #0f172a;
  }
  .partner-header {
    margin-bottom: 28px; padding: 16px 20px; background: #f8fafc;
    border-radius: 6px; border-left: 4px solid #0f172a;
  }
  .partner-header h2 {
    font-family: Georgia, 'Times New Roman', serif; font-size: 16px;
    font-weight: 600; color: #0f172a;
  }
  .partner-header .partner-type {
    font-size: 12px; color: #64748b; text-transform: uppercase;
    letter-spacing: 0.5px; margin-top: 2px;
  }
  .section { margin-bottom: 28px; page-break-inside: avoid; }
  .section h3 {
    font-family: Georgia, 'Times New Roman', serif; font-size: 14px;
    font-weight: 600; color: #0f172a; text-transform: uppercase;
    letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px; margin-bottom: 12px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    background: #f1f5f9; font-weight: 600; text-align: left;
    padding: 8px 12px; border-bottom: 2px solid #cbd5e1;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #475569;
  }
  thead th.numeric { text-align: right; }
  tbody td { padding: 7px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
  tbody td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.bold { font-weight: 600; color: #0f172a; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:last-child td { border-bottom: none; }
  .kpi-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px; margin-bottom: 16px;
  }
  .kpi-card {
    padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 6px; text-align: center;
  }
  .kpi-card .kpi-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
    color: #64748b; margin-bottom: 4px;
  }
  .kpi-card .kpi-value {
    font-family: Georgia, 'Times New Roman', serif; font-size: 20px;
    font-weight: 700; color: #0f172a;
  }
  .disclaimer {
    margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;
    font-size: 10px; color: #94a3b8; line-height: 1.6;
  }
  .generated-date { font-size: 10px; color: #94a3b8; margin-top: 8px; text-align: right; }
  @media print { body { padding: 0; } .section { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="letterhead">
  <div class="letterhead-left">
    <h1>${fundName}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ""}
  </div>
  <div class="letterhead-right">
    <div class="quarter">${qLabel}</div>
    <div>Quarterly Investor Statement</div>
  </div>
</div>

<div class="partner-header">
  <h2>${partnerName}</h2>
  ${partnerType ? `<div class="partner-type">${partnerType} Partner</div>` : ""}
</div>

<div class="section">
  <h3>Performance Summary</h3>
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">DPI</div><div class="kpi-value">${fmtMult(dpi)}</div></div>
    <div class="kpi-card"><div class="kpi-label">TVPI</div><div class="kpi-value">${fmtMult(tvpi)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Net IRR</div><div class="kpi-value">${fmtPct(irr)}</div></div>
    <div class="kpi-card"><div class="kpi-label">NAV</div><div class="kpi-value">${fmtMoney(nav)}</div></div>
  </div>
</div>

<div class="section">
  <h3>Capital Account Summary</h3>
  <table>
    <thead><tr><th>Item</th><th class="numeric">Amount</th></tr></thead>
    <tbody>
      <tr><td>Committed Capital</td><td class="numeric">${fmtMoneyFull(committed)}</td></tr>
      <tr><td>Contributed Capital</td><td class="numeric">${fmtMoneyFull(contributed)}</td></tr>
      <tr><td>Distributed Capital</td><td class="numeric">${fmtMoneyFull(distributed)}</td></tr>
      <tr><td class="bold">Net Asset Value</td><td class="numeric bold">${fmtMoneyFull(nav)}</td></tr>
      <tr><td>Unfunded Commitment</td><td class="numeric">${fmtMoneyFull(committed - contributed)}</td></tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h3>Performance Metrics</h3>
  <table>
    <thead><tr><th>Metric</th><th class="numeric">Value</th></tr></thead>
    <tbody>
      <tr><td>Distributions to Paid-In (DPI)</td><td class="numeric">${fmtMult(dpi)}</td></tr>
      <tr><td>Total Value to Paid-In (TVPI)</td><td class="numeric">${fmtMult(tvpi)}</td></tr>
      <tr><td>Net Internal Rate of Return (IRR)</td><td class="numeric">${fmtPct(irr)}</td></tr>
      <tr><td>Paid-In Percentage</td><td class="numeric">${fmtPct(paidIn)}</td></tr>
    </tbody>
  </table>
</div>

${activityHtml}
${multiFundHtml}

<div class="disclaimer">
  <p>
    This statement is provided for informational purposes only and does not
    constitute an offer to sell or a solicitation of an offer to buy any securities.
    Past performance is not indicative of future results. The information contained
    herein is based on data available as of the date of this report and is subject to
    change without notice. Net returns are presented after management fees and carried
    interest. Actual individual investor returns may vary based on the timing of capital
    contributions and distributions. This statement should be read in conjunction with
    the fund's audited financial statements and offering memorandum.
  </p>
</div>

<div class="generated-date">Generated ${today}</div>
</body>
</html>`;
}

// ── Route handler ───────────────────────────────────────────────────

/**
 * GET /api/re/v2/investors/[partnerId]/statement
 *
 * Query params:
 *   - fund_id   (optional) — scope to a single fund; omit for primary fund
 *   - quarter   (optional) — default "2026Q1"
 *   - env_id    (optional) — for business resolution
 *   - format    (optional) — "html" returns raw HTML; default returns JSON wrapper
 */
export async function GET(
  request: Request,
  { params }: { params: { partnerId: string } }
) {
  const pool = getPool();
  const emptyJson = {
    html: "",
    partner_name: null as string | null,
    fund_name: null as string | null,
    quarter: "",
    generated_at: new Date().toISOString(),
  };
  if (!pool) return Response.json(emptyJson);

  const { searchParams } = new URL(request.url);
  const fundId = searchParams.get("fund_id");
  const quarter = searchParams.get("quarter") || "2026Q1";
  const format = searchParams.get("format");

  try {
    // 1. Partner info
    const partnerRes = await pool.query(
      `SELECT partner_id::text, name, partner_type, business_id::text
       FROM re_partner
       WHERE partner_id = $1::uuid`,
      [params.partnerId]
    );
    const partner = partnerRes.rows[0];
    if (!partner) {
      if (format === "html") {
        return new Response("<html><body><p>Partner not found.</p></body></html>", {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return Response.json({ ...emptyJson, error: "Partner not found" }, { status: 404 });
    }

    // 2. Commitments across all funds
    const commitmentsRes = await pool.query(
      `SELECT
         pc.fund_id::text,
         f.name AS fund_name,
         f.vintage_year,
         f.strategy,
         pc.committed_amount::text,
         pc.commitment_date::text
       FROM re_partner_commitment pc
       JOIN repe_fund f ON f.fund_id = pc.fund_id
       WHERE pc.partner_id = $1::uuid
       ORDER BY f.name`,
      [params.partnerId]
    );

    // 3. Determine which fund to feature
    let fund: Record<string, unknown>;
    if (fundId) {
      const fundRes = await pool.query(
        `SELECT fund_id::text, name AS fund_name, vintage_year, strategy
         FROM repe_fund WHERE fund_id = $1::uuid`,
        [fundId]
      );
      fund = fundRes.rows[0] || { fund_id: fundId, fund_name: "Unknown Fund" };
    } else if (commitmentsRes.rows.length > 0) {
      // Use the first committed fund
      const c = commitmentsRes.rows[0];
      fund = {
        fund_id: c.fund_id,
        fund_name: c.fund_name,
        vintage_year: c.vintage_year,
        strategy: c.strategy,
      };
    } else {
      fund = { fund_id: "", fund_name: "No Fund" };
    }

    const activeFundId = (fund.fund_id || "") as string;

    // 4. Quarter metrics for this partner + fund
    let metrics: Record<string, unknown> | null = null;
    if (activeFundId) {
      const metricsRes = await pool.query(
        `SELECT
           contributed_to_date::text,
           distributed_to_date::text,
           nav::text,
           dpi::text,
           tvpi::text,
           irr::text
         FROM re_partner_quarter_metrics
         WHERE partner_id = $1::uuid
           AND fund_id = $2::uuid
           AND quarter = $3
           AND scenario_id IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [params.partnerId, activeFundId, quarter]
      );
      metrics = metricsRes.rows[0] || null;
    }

    // 5. Capital activity for the quarter
    const activityRes = await pool.query(
      `SELECT
         entry_id::text,
         fund_id::text,
         entry_type,
         amount_base::text AS amount,
         effective_date::text,
         quarter,
         memo
       FROM re_capital_ledger_entry
       WHERE partner_id = $1::uuid
         AND quarter = $2
         ${activeFundId ? "AND fund_id = $3::uuid" : ""}
       ORDER BY effective_date`,
      activeFundId
        ? [params.partnerId, quarter, activeFundId]
        : [params.partnerId, quarter]
    );

    // 6. Generate HTML
    const html = generateStatementHtml(
      partner,
      fund,
      quarter,
      commitmentsRes.rows,
      metrics,
      activityRes.rows,
    );

    // 7. Return based on format
    if (format === "html") {
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="statement_${partner.name}_${quarter}.html"`,
        },
      });
    }

    return Response.json({
      html,
      partner_name: partner.name as string,
      fund_name: (fund.fund_name || fund.name) as string,
      quarter,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[re/v2/investors/[id]/statement] DB error", err);
    if (format === "html") {
      return new Response("<html><body><p>Error generating statement.</p></body></html>", {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return Response.json({ ...emptyJson, error: "Internal error" }, { status: 500 });
  }
}
