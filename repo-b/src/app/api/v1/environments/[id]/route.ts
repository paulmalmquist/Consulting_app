import { NextRequest } from "next/server";
import { Pool } from "pg";
import { proxyOrFallback } from "@/lib/v1Proxy";
import {
  deleteFallbackEnvironment,
  getFallbackEnvironment,
  updateFallbackEnvironment,
} from "@/lib/labV1Fallback";
import {
  getMeridianEnvironmentRecord,
  MERIDIAN_APEX_ENV_ID,
} from "@/lib/server/eccStore";
import { resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";

export const runtime = "nodejs";

let _pool: Pool | null = null;
let _hasIndustryTypeColumn: boolean | null = null;
let _hasWorkspaceTemplateKeyColumn: boolean | null = null;

function getPool(): Pool | null {
  if (_pool) return _pool;
  const raw = process.env.PG_POOLER_URL || process.env.DATABASE_URL;
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

async function hasWorkspaceTemplateKeyColumn(pool: Pool) {
  if (_hasWorkspaceTemplateKeyColumn !== null) return _hasWorkspaceTemplateKeyColumn;
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'app'
           AND table_name = 'environments'
           AND column_name = 'workspace_template_key'
       ) AS exists`
    );
    _hasWorkspaceTemplateKeyColumn = Boolean(rows[0]?.exists);
  } catch {
    _hasWorkspaceTemplateKeyColumn = false;
  }
  return _hasWorkspaceTemplateKeyColumn;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/environments/${params.id}`, async () => {
    try {
      if (params.id === MERIDIAN_APEX_ENV_ID) {
        return Response.json(getMeridianEnvironmentRecord(params.id));
      }
      const pool = getPool();
      if (!pool) {
        const env = getFallbackEnvironment(params.id);
        if (!env) return Response.json({ message: "Environment not found" }, { status: 404 });
        return Response.json(env);
      }
      const [industryTypeEnabled, workspaceTemplateEnabled] = await Promise.all([
        hasIndustryTypeColumn(pool),
        hasWorkspaceTemplateKeyColumn(pool),
      ]);
      const { rows } = await pool.query(
        `SELECT env_id::text, client_name, industry,
                ${industryTypeEnabled ? "industry_type" : "industry AS industry_type"},
                ${workspaceTemplateEnabled ? "workspace_template_key" : "NULL::text AS workspace_template_key"},
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
        workspace_template_key?: string | null;
        notes?: string | null;
        is_active?: boolean;
      };

      if (params.id === MERIDIAN_APEX_ENV_ID) {
        return Response.json(
          { message: "ECC demo environment is managed by the Executive Command Center reset flow." },
          { status: 409 }
        );
      }

      const pool = getPool();
      if (!pool) {
        const updated = updateFallbackEnvironment(params.id, {
          client_name: body.client_name,
          industry: body.industry,
          industry_type: body.industry_type,
          workspace_template_key: body.workspace_template_key,
          notes: body.notes,
          is_active: body.is_active,
        });
        if (!updated) return Response.json({ message: "Environment not found" }, { status: 404 });
        return Response.json(updated);
      }

      const [industryTypeEnabled, workspaceTemplateEnabled] = await Promise.all([
        hasIndustryTypeColumn(pool),
        hasWorkspaceTemplateKeyColumn(pool),
      ]);
      const nextIndustryType = String(body.industry_type || body.industry || "").trim() || null;
      const nextIndustry = String(body.industry || nextIndustryType || "").trim() || null;
      const nextClientName = body.client_name?.trim() || null;
      const nextWorkspaceTemplateKey =
        resolveWorkspaceTemplateKey({
          workspaceTemplateKey: body.workspace_template_key,
          industry: nextIndustry,
          industryType: nextIndustryType,
        }) || null;

      const setClauses = [
        "client_name = COALESCE($2, client_name)",
        "industry = COALESCE($3, industry)",
      ];
      const values: Array<string | boolean | null> = [params.id, nextClientName, nextIndustry];
      if (industryTypeEnabled) {
        values.push(nextIndustryType);
        setClauses.push(`industry_type = COALESCE($${values.length}, industry_type)`);
      }
      if (workspaceTemplateEnabled) {
        values.push(nextWorkspaceTemplateKey);
        setClauses.push(`workspace_template_key = COALESCE($${values.length}, workspace_template_key)`);
      }
      values.push(body.notes ?? null);
      setClauses.push(`notes = COALESCE($${values.length}, notes)`);
      values.push(body.is_active ?? null);
      setClauses.push(`is_active = COALESCE($${values.length}, is_active)`);

      const { rows } = await pool.query(
        `UPDATE app.environments
            SET ${setClauses.join(",\n                ")}
          WHERE env_id = $1::uuid
        RETURNING env_id::text, client_name, industry,
                  ${industryTypeEnabled ? "industry_type" : "industry AS industry_type"},
                  ${workspaceTemplateEnabled ? "workspace_template_key" : "NULL::text AS workspace_template_key"},
                  schema_name, notes, is_active, created_at`,
        values
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
      if (params.id === MERIDIAN_APEX_ENV_ID) {
        return Response.json(
          { message: "ECC demo environment is pinned. Use Reset Demo instead." },
          { status: 409 }
        );
      }

      const pool = getPool();
      if (!pool) {
        const deleted = deleteFallbackEnvironment(params.id);
        if (!deleted) {
          return Response.json({ message: "Environment not found" }, { status: 404 });
        }
        return Response.json(deleted);
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
