/**
 * Shared server-side DB pool helper for Next.js API routes.
 * Reads PG_POOLER_URL (preferred) or DATABASE_URL and returns a pg Pool.
 * Safe to call repeatedly — pool is created once and reused.
 */
import { Pool } from "pg";

let _pool: Pool | null = null;

export function getPool(): Pool | null {
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

export async function resolveBusinessId(
  pool: Pool,
  envId: string | null,
  businessId: string | null
): Promise<string | null> {
  if (businessId) return businessId;
  if (!envId) return null;
  const res = await pool.query<{ business_id: string }>(
    `SELECT business_id::text FROM app.env_business_bindings WHERE env_id = $1::uuid LIMIT 1`,
    [envId]
  );
  return res.rows[0]?.business_id ?? null;
}
