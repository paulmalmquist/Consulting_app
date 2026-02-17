import { NextRequest } from "next/server";
import { Pool } from "pg";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

let _pool: Pool | null = null;
let _hasIndustryTypeColumn: boolean | null = null;

function getPool(): Pool | null {
  if (_pool) return _pool;
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return null;
  }

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/environments/${params.id}`, async () => {
    try {
      const pool = getPool();
      if (!pool) {
        return Response.json(
          { message: "Environment store unavailable: DATABASE_URL is not configured." },
          { status: 503 }
        );
      }
      const industryTypeEnabled = await hasIndustryTypeColumn(pool);
      const { rows } = await pool.query(
        `SELECT env_id::text, client_name, industry,
                ${industryTypeEnabled ? "industry_type" : "industry AS industry_type"},
                schema_name, notes, is_active, created_at
           FROM app.environments
          WHERE env_id = $1::uuid
          LIMIT 1`,
        [params.id]
      );
      const env = rows[0];
      if (!env) return Response.json({ message: "Environment not found" }, { status: 404 });
      return Response.json(env);
    } catch {
      return Response.json({ message: "Failed to load environment" }, { status: 500 });
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/environments/${params.id}`, async () => {
    try {
      const body = (await request.json()) as {
        client_name?: string;
        industry?: string;
        industry_type?: string;
        notes?: string | null;
        is_active?: boolean;
      };

      const pool = getPool();
      if (!pool) {
        return Response.json(
          { message: "Environment store unavailable: DATABASE_URL is not configured." },
          { status: 503 }
        );
      }

      const industryTypeEnabled = await hasIndustryTypeColumn(pool);
      const nextIndustryType = String(body.industry_type || body.industry || "").trim() || null;
      const nextIndustry = String(body.industry || nextIndustryType || "").trim() || null;
      const nextClientName = body.client_name?.trim() || null;

      const { rows } = industryTypeEnabled
        ? await pool.query(
            `UPDATE app.environments
                SET client_name = COALESCE($2, client_name),
                    industry = COALESCE($3, industry),
                    industry_type = COALESCE($4, industry_type),
                    notes = COALESCE($5, notes),
                    is_active = COALESCE($6, is_active)
              WHERE env_id = $1::uuid
            RETURNING env_id::text, client_name, industry, industry_type,
                      schema_name, notes, is_active, created_at`,
            [
              params.id,
              nextClientName,
              nextIndustry,
              nextIndustryType,
              body.notes,
              body.is_active,
            ]
          )
        : await pool.query(
            `UPDATE app.environments
                SET client_name = COALESCE($2, client_name),
                    industry = COALESCE($3, industry),
                    notes = COALESCE($4, notes),
                    is_active = COALESCE($5, is_active)
              WHERE env_id = $1::uuid
            RETURNING env_id::text, client_name, industry, industry AS industry_type,
                      schema_name, notes, is_active, created_at`,
            [params.id, nextClientName, nextIndustry, body.notes, body.is_active]
          );

      const updated = rows[0];
      if (!updated) return Response.json({ message: "Environment not found" }, { status: 404 });
      return Response.json(updated);
    } catch {
      return Response.json({ message: "Failed to update environment" }, { status: 500 });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/environments/${params.id}`, async () => {
    try {
      const pool = getPool();
      if (!pool) {
        return Response.json(
          { message: "Environment store unavailable: DATABASE_URL is not configured." },
          { status: 503 }
        );
      }

      const { rowCount } = await pool.query(
        `DELETE FROM app.environments WHERE env_id = $1::uuid`,
        [params.id]
      );
      if (!rowCount) {
        return Response.json({ message: "Environment not found" }, { status: 404 });
      }
      return Response.json({ ok: true, env_id: params.id });
    } catch {
      return Response.json({ message: "Failed to delete environment" }, { status: 500 });
    }
  });
}
