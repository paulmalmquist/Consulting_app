import { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

let _pool: Pool | null = null;

function getPool(): Pool | null {
  if (_pool) return _pool;
  const raw = process.env.PG_POOLER_URL || process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const hostname = u.hostname.replace(/^\[(.*)\]$/, "$1");
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
    _pool = new Pool({
      host: hostname,
      port: u.port ? Number(u.port) : 5432,
      user: decodeURIComponent(u.username || ""),
      password: decodeURIComponent(u.password || ""),
      database: u.pathname?.replace(/^\//, "") || "postgres",
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    });
    return _pool;
  } catch {
    return null;
  }
}

async function resolveBusinessId(
  pool: Pool,
  envId: string | null,
  businessId: string | null
): Promise<string | null> {
  // If business_id explicitly provided, use it directly
  if (businessId) return businessId;
  if (!envId) return null;

  // Look up via env_business_bindings
  const res = await pool.query<{ business_id: string }>(
    `SELECT business_id::text FROM app.env_business_bindings WHERE env_id = $1::uuid LIMIT 1`,
    [envId]
  );
  return res.rows[0]?.business_id ?? null;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "GET, POST, OPTIONS" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const envId =
    url.searchParams.get("env_id") ||
    request.headers.get("x-env-id") ||
    null;
  const businessIdParam = url.searchParams.get("business_id") || null;

  const pool = getPool();
  if (!pool) {
    return Response.json([]);
  }

  try {
    const businessId = await resolveBusinessId(pool, envId, businessIdParam);
    if (!businessId) {
      return Response.json([]);
    }

    const res = await pool.query(
      `SELECT
         fund_id::text,
         business_id::text,
         name,
         vintage_year,
         fund_type,
         strategy,
         sub_strategy,
         target_size,
         term_years,
         status,
         COALESCE(base_currency, 'USD') AS base_currency,
         inception_date,
         COALESCE(quarter_cadence, 'quarterly') AS quarter_cadence,
         COALESCE(target_sectors_json, '[]'::jsonb) AS target_sectors_json,
         COALESCE(target_geographies_json, '[]'::jsonb) AS target_geographies_json,
         target_leverage_min,
         target_leverage_max,
         target_hold_period_min_years,
         target_hold_period_max_years,
         COALESCE(metadata_json, '{}'::jsonb) AS metadata_json,
         created_at
       FROM repe_fund
       WHERE business_id = $1::uuid
       ORDER BY created_at DESC`,
      [businessId]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v1/funds] DB error", err);
    // If columns from migration 267 don't exist, try without them
    try {
      const pool2 = getPool();
      if (!pool2) return Response.json([]);
      const businessId = await resolveBusinessId(pool2, envId, businessIdParam);
      if (!businessId) return Response.json([]);

      const res = await pool2.query(
        `SELECT
           fund_id::text,
           business_id::text,
           name,
           vintage_year,
           fund_type,
           strategy,
           sub_strategy,
           target_size,
           term_years,
           status,
           created_at
         FROM repe_fund
         WHERE business_id = $1::uuid
         ORDER BY created_at DESC`,
        [businessId]
      );
      return Response.json(res.rows);
    } catch {
      return Response.json([]);
    }
  }
}

export async function POST(_request: NextRequest) {
  return Response.json(
    {
      error_code: "FUND_CREATE_UNAVAILABLE",
      message:
        "Fund creation requires a configured BOS API upstream. Set BOS_API_ORIGIN.",
    },
    { status: 503 }
  );
}
