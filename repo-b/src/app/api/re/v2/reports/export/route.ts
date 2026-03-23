import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/reports/export?report_key=...&entity_type=...&entity_id=...&quarter=...&env_id=...&business_id=...&format=csv
 * Export a report's assembled data as CSV (or JSON).
 * Assembles the same statement data the frontend uses, flattened for download.
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const reportKey = searchParams.get("report_key");
  const entityType = searchParams.get("entity_type") || "asset";
  const entityId = searchParams.get("entity_id");
  const quarter = searchParams.get("quarter");
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const format = searchParams.get("format") || "csv";

  if (!reportKey || !entityId || !quarter || !envId || !businessId) {
    return Response.json(
      { error: "report_key, entity_id, quarter, env_id, and business_id are required" },
      { status: 400 },
    );
  }

  try {
    // Get report template
    const tmplRes = await pool.query(
      "SELECT * FROM re_report_template WHERE report_key = $1",
      [reportKey],
    );
    if (tmplRes.rows.length === 0) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }
    const template = tmplRes.rows[0];
    const blocks = template.blocks as Array<{ type: string; config: Record<string, unknown> }>;

    // Collect all statement blocks and assemble data
    const exportRows: Array<{ section: string; line_code: string; label: string; amount: number | null; format_type: string }> = [];

    for (const block of blocks) {
      if (block.type === "statement_table") {
        const statement = (block.config.statement as string) || "IS";
        const title = (block.config.title as string) || statement;

        // Parse quarter for date range
        const match = quarter.match(/^(\d{4})Q([1-4])$/);
        if (!match) continue;
        const year = Number(match[1]);
        const q = Number(match[2]);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
        const lastDay = new Date(year, endMonth, 0).getDate();
        const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;

        // Get statement line definitions
        const defRes = await pool.query(
          `SELECT line_code, display_label, sort_order, is_subtotal, subtotal_of, format_type
           FROM acct_statement_line_def
           WHERE statement = $1
           ORDER BY sort_order`,
          [statement],
        );

        // Get actual amounts
        let amountMap: Record<string, number> = {};

        if (entityType === "asset") {
          const dataRes = await pool.query(
            `SELECT line_code, SUM(amount) AS amount
             FROM acct_normalized_noi_monthly
             WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
               AND period_month >= $4::date AND period_month <= $5::date
               AND scenario = 'actual'
             GROUP BY line_code`,
            [envId, businessId, entityId, startDate, endDate],
          );
          for (const row of dataRes.rows) {
            amountMap[row.line_code] = Number(row.amount);
          }
        } else if (entityType === "investment") {
          // Aggregate across assets with ownership adjustment
          const dataRes = await pool.query(
            `SELECT n.line_code, SUM(n.amount * COALESCE(j.ownership_pct, 1)) AS amount
             FROM acct_normalized_noi_monthly n
             JOIN repe_property_asset a ON a.id = n.asset_id
             LEFT JOIN re_jv j ON j.asset_id = a.id
             JOIN repe_investment inv ON inv.id = $3::uuid
             WHERE n.env_id = $1 AND n.business_id = $2::uuid
               AND n.period_month >= $4::date AND n.period_month <= $5::date
               AND n.scenario = 'actual'
               AND (j.investment_id = $3::uuid OR a.id IN (
                 SELECT asset_id FROM re_jv WHERE investment_id = $3::uuid
               ))
             GROUP BY n.line_code`,
            [envId, businessId, entityId, startDate, endDate],
          );
          for (const row of dataRes.rows) {
            amountMap[row.line_code] = Number(row.amount);
          }
        }

        // Compute subtotals and build rows
        for (const def of defRes.rows) {
          let amount: number | null = null;
          if (def.is_subtotal && def.subtotal_of?.length > 0) {
            amount = 0;
            for (const code of def.subtotal_of) {
              amount += amountMap[code] || 0;
            }
            amountMap[def.line_code] = amount;
          } else {
            amount = amountMap[def.line_code] ?? null;
          }

          exportRows.push({
            section: title,
            line_code: def.line_code,
            label: def.display_label,
            amount,
            format_type: def.format_type || "currency",
          });
        }
      }

      if (block.type === "kpi_strip") {
        const metrics = (block.config.metrics as string[]) || [];
        // Parse quarter for date range
        const match = quarter.match(/^(\d{4})Q([1-4])$/);
        if (!match) continue;
        const year = Number(match[1]);
        const q = Number(match[2]);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
        const lastDay = new Date(year, endMonth, 0).getDate();
        const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;

        const kpiPath =
          entityType === "asset"
            ? `SELECT line_code, SUM(amount) AS amount
               FROM acct_normalized_noi_monthly
               WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
                 AND period_month >= $4::date AND period_month <= $5::date
                 AND scenario = 'actual' AND line_code = ANY($6)
               GROUP BY line_code`
            : `SELECT line_code, SUM(amount) AS amount
               FROM acct_normalized_noi_monthly
               WHERE env_id = $1 AND business_id = $2::uuid
                 AND period_month >= $4::date AND period_month <= $5::date
                 AND scenario = 'actual' AND line_code = ANY($6)
               GROUP BY line_code`;

        const kpiRes = await pool.query(kpiPath, [
          envId, businessId, entityId, startDate, endDate, metrics,
        ]);

        for (const row of kpiRes.rows) {
          exportRows.push({
            section: "KPIs",
            line_code: row.line_code,
            label: row.line_code.replace(/_/g, " "),
            amount: Number(row.amount),
            format_type: "number",
          });
        }
      }
    }

    if (format === "json") {
      return Response.json({
        report_key: reportKey,
        report_name: template.name,
        entity_type: entityType,
        entity_id: entityId,
        quarter,
        rows: exportRows,
      });
    }

    // CSV format
    const csvHeader = "Section,Line Code,Label,Amount,Format";
    const csvRows = exportRows.map((r) =>
      [
        `"${r.section}"`,
        r.line_code,
        `"${r.label}"`,
        r.amount !== null ? r.amount.toFixed(2) : "",
        r.format_type,
      ].join(","),
    );
    const csvContent = [csvHeader, ...csvRows].join("\n");

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${reportKey}_${entityId.slice(0, 8)}_${quarter}.csv"`,
      },
    });
  } catch (err) {
    console.error("[reports/export] Error:", err);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
