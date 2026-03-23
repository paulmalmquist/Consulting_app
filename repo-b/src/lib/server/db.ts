import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __winstonRepePool: Pool | undefined;
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values: Record<string, string> = {};
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function resolveDatabaseUrl(): string {
  const direct = process.env.PG_POOLER_URL || process.env.DATABASE_URL;
  if (direct) {
    return direct;
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const backendEnv = parseEnvFile(path.join(repoRoot, "backend", ".env"));
  const localEnv = parseEnvFile(path.join(process.cwd(), ".env.local"));
  const fallback =
    backendEnv.PG_POOLER_URL ||
    backendEnv.DATABASE_URL ||
    localEnv.PG_POOLER_URL ||
    localEnv.DATABASE_URL;

  if (!fallback) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL/PG_POOLER_URL or configure backend/.env."
    );
  }

  return fallback;
}

export function getPool(): Pool {
  if (global.__winstonRepePool) {
    return global.__winstonRepePool;
  }

  const url = new URL(resolveDatabaseUrl());
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  global.__winstonRepePool = new Pool({
    host,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database: url.pathname.replace(/^\//, "") || "postgres",
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  return global.__winstonRepePool;
}

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

export function mapRows<T extends QueryResultRow, R>(
  rows: T[],
  mapper: (row: T) => R
): R[] {
  return rows.map(mapper);
}
