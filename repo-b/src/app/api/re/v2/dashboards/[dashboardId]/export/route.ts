import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/dashboards/[dashboardId]/export?format=csv
 * Export dashboard data as CSV or JSON.
 * Records export in audit trail.
 */
export async function GET(
  request: Request,
  { params }: { params: { dashboardId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";

  try {
    // Load dashboard
    const dbRes = await pool.query(
      "SELECT id, name, spec, entity_scope, quarter, env_id, business_id FROM re_dashboard WHERE id = $1::uuid",
      [params.dashboardId],
    );
    if (dbRes.rows.length === 0) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }

    const dashboard = dbRes.rows[0];
    const spec = dashboard.spec as { widgets: Array<{ id: string; type: string; config: Record<string, unknown> }> };
    const entityScope = dashboard.entity_scope as Record<string, unknown>;
    const envId = dashboard.env_id;
    const businessId = dashboard.business_id;
    const quarter = dashboard.quarter;

    // Collect exportable data from statement_table widgets
    const exportRows: Array<{ widget: string; line_code: string; label: string; amount: number | null }> = [];

    for (const widget of spec.widgets || []) {
      if (widget.type === "statement_table" && widget.config.statement) {
        const statement = widget.config.statement as string;
        const entityType = (widget.config.entity_type || entityScope.entity_type || "asset") as string;
        const entityIds = (widget.config.entity_ids || entityScope.entity_ids || []) as string[];

        if (!quarter || entityIds.length === 0) continue;

        const match = (quarter as string).match(/^(\d{4})Q([1-4])$/);
        if (!match) continue;

        const year = Number(match[1]);
        const q = Number(match[2]);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
        const lastDay = new Date(year, endMonth, 0).getDate();
        const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;

        // Get statement definitions
        const defRes = await pool.query(
          `SELECT line_code, display_label, sort_order
           FROM acct_statement_line_def WHERE statement = $1 ORDER BY sort_order`,
          [statement],
        );

        // Get amounts for first entity
        const assetId = entityIds[0];
        if (assetId && entityType === "asset") {
          const dataRes = await pool.query(
            `SELECT line_code, SUM(amount) AS amount
             FROM acct_normalized_noi_monthly
             WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
               AND period_month >= $4::date AND period_month <= $5::date AND scenario = 'actual'
             GROUP BY line_code`,
            [envId, businessId, assetId, startDate, endDate],
          );
          const amounts = new Map(dataRes.rows.map((r: { line_code: string; amount: string }) => [r.line_code, Number(r.amount)]));

          for (const def of defRes.rows) {
            exportRows.push({
              widget: widget.config.title as string || statement,
              line_code: def.line_code,
              label: def.display_label,
              amount: amounts.get(def.line_code) ?? null,
            });
          }
        }
      }

      // KPI metrics
      if (widget.type === "metrics_strip" || widget.type === "metric_card") {
        const metrics = (widget.config.metrics || []) as Array<{ key: string; label?: string }>;
        for (const m of metrics) {
          exportRows.push({
            widget: "KPIs",
            line_code: m.key,
            label: m.label || m.key.replace(/_/g, " "),
            amount: null,
          });
        }
      }
    }

    // Record export
    await pool.query(
      `INSERT INTO re_dashboard_export (dashboard_id, format, filters_used)
       VALUES ($1::uuid, $2, $3::jsonb)`,
      [params.dashboardId, format, JSON.stringify({ quarter, entity_scope: entityScope })],
    );

    if (format === "json") {
      return Response.json({
        dashboard_name: dashboard.name,
        quarter,
        exported_at: new Date().toISOString(),
        rows: exportRows,
      });
    }

    // CSV
    const csvHeader = "Widget,Line Code,Label,Amount";
    const csvRows = exportRows.map((r) =>
      [`"${r.widget}"`, r.line_code, `"${r.label}"`, r.amount !== null ? r.amount.toFixed(2) : ""].join(","),
    );
    const csvContent = [csvHeader, ...csvRows].join("\n");

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${dashboard.name.replace(/\s+/g, "_")}_${quarter || "latest"}.csv"`,
      },
    });
  } catch (err) {
    console.error("[dashboards/export] Error:", err);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
