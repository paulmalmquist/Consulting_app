import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { modelId: string; assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ historical: [], projected: [], assumptions: {} });

  try {
    // Fetch historical quarterly data
    const histRes = await pool.query(
      `SELECT quarter, revenue, opex, noi, occupancy, asset_value, cap_rate
       FROM re_asset_quarter_state
       WHERE asset_id = $1::uuid AND scenario_id IS NULL
       ORDER BY quarter ASC`,
      [params.assetId],
    );

    // Fetch surgery assumptions for this asset in this model
    const ovRes = await pool.query(
      `SELECT key, value_decimal, value_int, value_text
       FROM re_model_override
       WHERE model_id = $1::uuid
         AND scope_node_id = $2::uuid
         AND key LIKE 'surgery:%'
         AND is_active = true`,
      [params.modelId, params.assetId],
    );

    const assumptions: Record<string, number | string | null> = {};
    for (const row of ovRes.rows) {
      const field = (row.key as string).split(":").pop()!;
      assumptions[field] = row.value_decimal ?? row.value_int ?? row.value_text;
    }

    const rentGrowth = (assumptions.rent_growth as number) ?? 0.025;
    const expenseGrowth = (assumptions.expense_growth as number) ?? 0.02;
    const saleYear = (assumptions.sale_year as number) ?? 5;
    const forwardNoi = assumptions.forward_noi as number | null;

    // Compute projected cash flows
    const historical = histRes.rows;
    const lastRow = historical.length > 0 ? historical[historical.length - 1] : null;
    const baseNoi = forwardNoi ?? (lastRow?.noi != null ? Number(lastRow.noi) * 4 : 0);
    const baseRevenue = lastRow?.revenue != null ? Number(lastRow.revenue) * 4 : baseNoi * 1.5;
    const baseOpex = baseRevenue - baseNoi;

    const projected: { year: number; revenue: number; opex: number; noi: number }[] = [];
    let revenue = baseRevenue;
    let opex = baseOpex;

    for (let y = 1; y <= saleYear; y++) {
      revenue *= 1 + rentGrowth;
      opex *= 1 + expenseGrowth;
      const noi = revenue - opex;
      projected.push({
        year: new Date().getFullYear() + y,
        revenue: Math.round(revenue),
        opex: Math.round(opex),
        noi: Math.round(noi),
      });
    }

    return Response.json({ historical, projected, assumptions });
  } catch (err) {
    console.error("[cashflow GET]", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
