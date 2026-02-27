import { NextRequest } from "next/server";
import { Pool } from "pg";
import { proxyOrFallback } from "@/lib/v1Proxy";
import {
  createFallbackEnvironment,
  listFallbackEnvironments,
} from "@/lib/labV1Fallback";
import { getMeridianEnvironmentRecord } from "@/lib/server/eccStore";

export const runtime = "nodejs";

type EnvironmentRow = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type?: string;
  schema_name: string;
  notes?: string | null;
  is_active: boolean;
  created_at?: string | Date;
};

let _pool: Pool | null = null;
let _hasIndustryTypeColumn: boolean | null = null;

function getPool(): Pool | null {
  if (_pool) return _pool;
  const raw = process.env.PG_POOLER_URL || process.env.DATABASE_URL;
  if (!raw) {
    return null;
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

async function hasIndustryTypeColumn(pool: Pool) {
  if (_hasIndustryTypeColumn !== null) return _hasIndustryTypeColumn;
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'app'
           AND table_name = 'environments'
           AND column_name = 'industry_type'
       ) AS exists`
    );
    _hasIndustryTypeColumn = Boolean(rows[0]?.exists);
  } catch {
    _hasIndustryTypeColumn = false;
  }
  return _hasIndustryTypeColumn;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return proxyOrFallback(request, `/v1/environments${url.search}`, async () => {
      try {
        const pool = getPool();
        if (!pool) {
          const meridian = getMeridianEnvironmentRecord();
          const environments = [meridian, ...listFallbackEnvironments().filter((env) => env.env_id !== meridian.env_id)];
          return Response.json({ environments });
        }
        const industryTypeEnabled = await hasIndustryTypeColumn(pool);
        const { rows } = await pool.query<EnvironmentRow>(
          `SELECT env_id::text, client_name, industry,
                  ${industryTypeEnabled ? "industry_type" : "industry AS industry_type"},
                  schema_name, notes, is_active, created_at
         FROM app.environments
         ORDER BY created_at DESC`
        );
        const meridian = getMeridianEnvironmentRecord();
        const environments = rows.map((row) => ({
          ...row,
          industry_type: row.industry_type || row.industry,
          created_at:
            row.created_at instanceof Date
              ? row.created_at.toISOString()
              : row.created_at,
        }));
        if (!environments.some((env) => env.env_id === meridian.env_id)) {
          environments.unshift(meridian);
        }
        return Response.json({ environments });
      } catch {
        return Response.json(
          { message: "Failed to load environments" },
          { status: 500 }
        );
      }
    });
}

export async function POST(request: NextRequest) {
  return proxyOrFallback(request, "/v1/environments", async () => {
    try {
      const body = (await request.json()) as {
        client_name?: string;
        industry?: string;
        industry_type?: string;
        notes?: string | null;
      };

      const clientName = String(body.client_name || "").trim();
      if (!clientName) {
        return Response.json({ message: "client_name is required" }, { status: 400 });
      }

      const industryType = String(body.industry_type || body.industry || "general").trim() || "general";
      const industry = String(body.industry || industryType).trim() || "general";
      const notes = body.notes ?? null;
      const schemaName = slugSchemaName(clientName);

      const pool = getPool();
      if (!pool) {
        const created = createFallbackEnvironment({
          client_name: clientName,
          industry,
          industry_type: industryType,
          notes,
        });
        return Response.json(created, { status: 201 });
      }

      const industryTypeEnabled = await hasIndustryTypeColumn(pool);

      const { rows } = await pool.query<{
        env_id: string;
        client_name: string;
        industry: string;
        industry_type?: string;
        schema_name: string;
      }>(
        industryTypeEnabled
          ? `INSERT INTO app.environments (client_name, industry, industry_type, schema_name, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING env_id::text, client_name, industry, industry_type, schema_name`
          : `INSERT INTO app.environments (client_name, industry, schema_name, notes)
             VALUES ($1, $2, $3, $4)
             RETURNING env_id::text, client_name, industry, industry AS industry_type, schema_name`,
        industryTypeEnabled
          ? [clientName, industry, industryType, schemaName, notes]
          : [clientName, industry, schemaName, notes]
      );

      return Response.json(rows[0], { status: 201 });
    } catch {
      return Response.json(
        { message: "Failed to create environment" },
        { status: 500 }
      );
    }
  });
}
