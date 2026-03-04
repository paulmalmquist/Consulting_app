import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

const SURGERY_KEY_MAP: Record<string, { prefix: string; value_col: string }> = {
  rent_growth:      { prefix: "surgery:cf", value_col: "value_decimal" },
  expense_growth:   { prefix: "surgery:cf", value_col: "value_decimal" },
  vacancy:          { prefix: "surgery:cf", value_col: "value_decimal" },
  forward_noi:      { prefix: "surgery:cf", value_col: "value_decimal" },
  sale_year:        { prefix: "surgery:exit", value_col: "value_int" },
  cap_rate:         { prefix: "surgery:exit", value_col: "value_decimal" },
  disposition_pct:  { prefix: "surgery:exit", value_col: "value_decimal" },
  notes:            { prefix: "surgery:exit", value_col: "value_text" },
};

export async function GET(
  _request: Request,
  { params }: { params: { modelId: string; assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ cash_flow: {}, exit: {} });

  try {
    const res = await pool.query(
      `SELECT key, value_decimal, value_int, value_text
       FROM re_model_override
       WHERE model_id = $1::uuid
         AND scope_node_id = $2::uuid
         AND key LIKE 'surgery:%'
         AND is_active = true`,
      [params.modelId, params.assetId],
    );

    const cash_flow: Record<string, number | string | null> = {};
    const exit: Record<string, number | string | null> = {};

    for (const row of res.rows) {
      const parts = (row.key as string).split(":");
      const section = parts[1]; // "cf" or "exit"
      const field = parts[2];
      const value = row.value_decimal ?? row.value_int ?? row.value_text;
      if (section === "cf") cash_flow[field] = value;
      else if (section === "exit") exit[field] = value;
    }

    return Response.json({ cash_flow, exit });
  } catch (err) {
    console.error("[surgery GET]", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { modelId: string; assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No database" }, { status: 500 });

  try {
    const body = await request.json();
    const { cash_flow = {}, exit = {} } = body as {
      cash_flow?: Record<string, number | string>;
      exit?: Record<string, number | string>;
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const allFields = [
        ...Object.entries(cash_flow).map(([k, v]) => ({ section: "cf", field: k, value: v })),
        ...Object.entries(exit).map(([k, v]) => ({ section: "exit", field: k, value: v })),
      ];

      for (const { section, field, value } of allFields) {
        const key = `surgery:${section}:${field}`;
        const meta = SURGERY_KEY_MAP[field];
        if (!meta) continue;

        const valueType = meta.value_col === "value_decimal" ? "decimal"
          : meta.value_col === "value_int" ? "int"
          : "string";

        const valDecimal = valueType === "decimal" ? value : null;
        const valInt = valueType === "int" ? value : null;
        const valText = valueType === "string" ? value : null;

        await client.query(
          `INSERT INTO re_model_override
             (model_id, scope_node_type, scope_node_id, key, value_type, value_decimal, value_int, value_text, is_active)
           VALUES ($1::uuid, 'asset', $2::uuid, $3, $4, $5, $6, $7, true)
           ON CONFLICT (model_id, scope_node_type, scope_node_id, key)
           DO UPDATE SET
             value_decimal = EXCLUDED.value_decimal,
             value_int = EXCLUDED.value_int,
             value_text = EXCLUDED.value_text,
             is_active = true`,
          [params.modelId, params.assetId, key, valueType, valDecimal, valInt, valText],
        );
      }

      await client.query("COMMIT");
      return Response.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[surgery POST]", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
