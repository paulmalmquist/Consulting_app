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

function resolveEnvId(request: NextRequest): string | null {
  const url = new URL(request.url);
  return (
    url.searchParams.get("env_id") ||
    request.headers.get("x-env-id") ||
    null
  );
}

function missingEnv() {
  return Response.json(
    { error_code: "MISSING_ENV_ID", message: "env_id is required" },
    { status: 400 }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "GET, OPTIONS" },
  });
}

export async function GET(request: NextRequest) {
  const envId = resolveEnvId(request);
  if (!envId) return missingEnv();

  const pool = getPool();
  if (!pool) {
    // No DB — return a safe stub so the UI doesn't break
    return Response.json({
      env_id: envId,
      business_id: envId,
      industry: "real_estate",
      is_bootstrapped: false,
      funds_count: 0,
      scenarios_count: 0,
    });
  }

  try {
    // 1. Resolve business_id from env_business_bindings
    const bindingRes = await pool.query<{ business_id: string; industry: string }>(
      `SELECT eb.business_id::text,
              COALESCE(e.industry, 'real_estate') AS industry
       FROM app.env_business_bindings eb
       LEFT JOIN app.environments e ON e.env_id = eb.env_id
       WHERE eb.env_id = $1::uuid
       LIMIT 1`,
      [envId]
    );

    if (bindingRes.rows.length === 0) {
      return Response.json(
        {
          error_code: "CONTEXT_ERROR",
          message: `No business binding found for environment: ${envId}`,
        },
        { status: 400 }
      );
    }

    const { business_id, industry } = bindingRes.rows[0];

    // 2. Count funds
    const fundsRes = await pool.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM repe_fund WHERE business_id = $1::uuid`,
      [business_id]
    );
    const fundsCount = parseInt(fundsRes.rows[0]?.cnt ?? "0", 10);

    // 3. Count scenarios (if table exists)
    let scenariosCount = 0;
    try {
      const scenRes = await pool.query<{ cnt: string }>(
        `SELECT count(*)::text AS cnt
         FROM re_scenario s
         JOIN repe_fund f ON f.fund_id = s.fund_id
         WHERE f.business_id = $1::uuid`,
        [business_id]
      );
      scenariosCount = parseInt(scenRes.rows[0]?.cnt ?? "0", 10);
    } catch {
      // re_scenario table may not exist — ignore
    }

    const isBootstrapped = fundsCount > 0;

    return Response.json({
      env_id: envId,
      business_id,
      industry: industry || "real_estate",
      is_bootstrapped: isBootstrapped,
      funds_count: fundsCount,
      scenarios_count: scenariosCount,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[re/v1/context] DB error", err);
    return Response.json(
      { error_code: "INTERNAL_ERROR", message: "Failed to resolve RE context", detail },
      { status: 500 }
    );
  }
}
