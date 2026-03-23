import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const sector = searchParams.get("sector");
  const state = searchParams.get("state");
  const msa = searchParams.get("msa");
  const status = searchParams.get("status");
  const q = searchParams.get("q");
  const investmentId = searchParams.get("investment_id");
  const fundId = searchParams.get("fund_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);
  const offset = parseInt(searchParams.get("offset") || "0", 10) || 0;

  if (!envId && !fundId) {
    return Response.json([], { status: 200 });
  }

  try {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    // If env_id provided, resolve business_id through env_business_bindings
    if (envId) {
      conditions.push(
        `f.business_id = (SELECT business_id::uuid FROM app.env_business_bindings WHERE env_id = $${idx}::uuid LIMIT 1)`
      );
      values.push(envId);
      idx++;
    }

    if (fundId) {
      conditions.push(`d.fund_id = $${idx}::uuid`);
      values.push(fundId);
      idx++;
    }

    if (investmentId) {
      conditions.push(`a.deal_id = $${idx}::uuid`);
      values.push(investmentId);
      idx++;
    }

    if (sector) {
      conditions.push(`pa.property_type = $${idx}`);
      values.push(sector);
      idx++;
    }

    if (state) {
      conditions.push(`COALESCE(pa.state, '') = $${idx}`);
      values.push(state);
      idx++;
    }

    if (msa) {
      conditions.push(`COALESCE(pa.msa, '') ILIKE $${idx}`);
      values.push(`%${msa}%`);
      idx++;
    }

    if (status) {
      conditions.push(`COALESCE(a.asset_status, 'active') = $${idx}`);
      values.push(status);
      idx++;
    }

    if (q) {
      conditions.push(`(a.name ILIKE $${idx} OR pa.city ILIKE $${idx} OR pa.address ILIKE $${idx} OR pa.market ILIKE $${idx})`);
      values.push(`%${q}%`);
      idx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limitParam = `$${idx}`;
    values.push(limit);
    idx++;
    const offsetParam = `$${idx}`;
    values.push(offset);

    const res = await pool.query(
      `SELECT
         a.asset_id::text,
         a.name,
         a.asset_type,
         pa.property_type AS sector,
         pa.city,
         pa.state,
         pa.msa,
         pa.market,
         pa.address,
         COALESCE(pa.units, 0) AS units,
         COALESCE(pa.gross_sf, 0) AS square_feet,
         COALESCE(a.asset_status, 'active') AS status,
         a.deal_id::text AS investment_id,
         d.name AS investment_name,
         d.fund_id::text,
         f.name AS fund_name,
         qs.noi AS latest_noi,
         qs.occupancy AS latest_occupancy,
         qs.asset_value AS latest_value,
         qs.quarter AS latest_quarter,
         a.created_at
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
       LEFT JOIN LATERAL (
         SELECT noi, occupancy, asset_value, quarter
         FROM re_asset_quarter_state
         WHERE asset_id = a.asset_id AND scenario_id IS NULL
         ORDER BY quarter DESC LIMIT 1
       ) qs ON true
       ${whereClause}
       ORDER BY a.name
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/assets] DB error", err);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const investmentId = body.investment_id as string | undefined;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const assetType = (body.asset_type as string) || "property";

  if (!investmentId) {
    return Response.json({ error: "investment_id is required" }, { status: 400 });
  }
  if (name.length < 2) {
    return Response.json({ error: "name is required (min 2 chars)" }, { status: 400 });
  }

  const assetId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, asset_status, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'active', NOW())`,
      [assetId, investmentId, assetType, name]
    );

    if (assetType === "property") {
      await client.query(
        `INSERT INTO repe_property_asset (asset_id, property_type, city, state, msa, address, units, square_feet)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
        [
          assetId,
          (body.property_type as string) || null,
          (body.city as string) || null,
          (body.state as string) || null,
          (body.msa as string) || null,
          (body.address as string) || null,
          body.units ?? null,
          body.square_feet ?? null,
        ]
      );
    }

    await client.query("COMMIT");

    // Return created asset in list-item format
    const res = await pool.query(
      `SELECT
         a.asset_id::text,
         a.name,
         a.asset_type,
         pa.property_type AS sector,
         pa.city,
         pa.state,
         pa.msa,
         pa.market,
         pa.address,
         COALESCE(pa.units, 0) AS units,
         COALESCE(pa.gross_sf, 0) AS square_feet,
         COALESCE(a.asset_status, 'active') AS status,
         a.deal_id::text AS investment_id,
         d.name AS investment_name,
         d.fund_id::text,
         f.name AS fund_name,
         a.created_at
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
       WHERE a.asset_id = $1::uuid`,
      [assetId]
    );

    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[re/v2/assets] POST error", err);
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
