import { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

type EnvironmentRow = {
  env_id: string;
  client_name: string;
  industry: string;
  schema_name: string;
  is_active: boolean;
};

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  // Don't rely on connection string `sslmode=` parsing. In some environments
  // (notably Vercel), Node can reject Supabase's chain unless we explicitly
  // disable verification. Build the config ourselves and force SSL.
  const u = new URL(raw);
  const hostname = u.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = u.port ? Number(u.port) : 5432;
  const user = decodeURIComponent(u.username || "");
  const password = decodeURIComponent(u.password || "");
  const database = u.pathname?.replace(/^\//, "") || "postgres";

  const isLocal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  _pool = new Pool({
    host: hostname,
    port,
    user,
    password,
    database,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  return _pool;
}

function slugSchemaName(clientName: string): string {
  const base = clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return `env_${base || "client"}`;
}

export async function GET() {
  try {
    const pool = getPool();
    const { rows } = await pool.query<EnvironmentRow>(
      `SELECT env_id::text, client_name, industry, schema_name, is_active
       FROM app.environments
       ORDER BY created_at DESC`
    );
    return Response.json({ environments: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      client_name?: string;
      industry?: string;
      notes?: string | null;
    };

    const clientName = String(body.client_name || "").trim();
    if (!clientName) {
      return Response.json({ message: "client_name is required" }, { status: 400 });
    }

    const industry = String(body.industry || "general").trim() || "general";
    const notes = body.notes ?? null;
    const schemaName = slugSchemaName(clientName);

    const pool = getPool();
    const { rows } = await pool.query<{
      env_id: string;
      client_name: string;
      industry: string;
      schema_name: string;
    }>(
      `INSERT INTO app.environments (client_name, industry, schema_name, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING env_id::text, client_name, industry, schema_name`,
      [clientName, industry, schemaName, notes]
    );

    return Response.json(rows[0], { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ message }, { status: 500 });
  }
}
