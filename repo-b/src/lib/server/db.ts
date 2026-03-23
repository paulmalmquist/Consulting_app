/**
 * Shared server-side DB pool helper for Next.js API routes.
 * Reads PG_POOLER_URL (preferred) or DATABASE_URL and returns a pg Pool.
 * Safe to call repeatedly — pool is created once and reused.
 */
import { Pool, type PoolClient } from "pg";

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

/** Parse a numeric DB value that may arrive as string, number, or null. */
export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse a date DB value into an ISO string or null. */
export function parseDate(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Require a non-null string, throw if missing. */
export function requireString(v: unknown, label = "value"): string {
  if (typeof v === "string" && v.length > 0) return v;
  throw new Error(`Missing required string: ${label}`);
}

/** Acquire a client from the pool, run fn, then release. */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  if (!pool) throw new Error("Database pool not available");
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Run fn inside a BEGIN/COMMIT transaction (ROLLBACK on error). */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
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
