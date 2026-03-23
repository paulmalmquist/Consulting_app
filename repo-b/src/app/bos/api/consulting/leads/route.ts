import { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message: string) {
  return Response.json(
    { error_code: "VALIDATION_ERROR", message },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      {
        error_code: "CONFIG_ERROR",
        message: "Consulting leads are unavailable: DATABASE_URL is not configured.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const envId = url.searchParams.get("env_id")?.trim() || "";
  const businessId = url.searchParams.get("business_id")?.trim() || "";
  const minScoreRaw = url.searchParams.get("min_score");
  const minScore =
    minScoreRaw !== null && minScoreRaw !== ""
      ? Number.parseInt(minScoreRaw, 10)
      : null;

  if (!UUID_RE.test(envId)) {
    return badRequest("env_id must be a valid UUID.");
  }
  if (!UUID_RE.test(businessId)) {
    return badRequest("business_id must be a valid UUID.");
  }
  if (minScore !== null && (Number.isNaN(minScore) || minScore < 0 || minScore > 100)) {
    return badRequest("min_score must be an integer between 0 and 100.");
  }

  try {
    const params: Array<string | number> = [envId, businessId];
    let sql = `
      SELECT a.crm_account_id,
             p.id AS lead_profile_id,
             a.name AS company_name,
             a.industry,
             a.website,
             a.account_type,
             p.ai_maturity,
             p.pain_category,
             p.lead_score,
             p.lead_source,
             p.company_size,
             p.revenue_band,
             p.erp_system,
             p.estimated_budget,
             p.qualified_at,
             p.disqualified_at,
             s.key AS stage_key,
             s.label AS stage_label,
             a.created_at
        FROM crm_account a
        JOIN cro_lead_profile p ON p.crm_account_id = a.crm_account_id
        LEFT JOIN crm_opportunity o
          ON o.crm_account_id = a.crm_account_id
         AND o.status = 'open'
        LEFT JOIN crm_pipeline_stage s
          ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
       WHERE p.env_id = $1
         AND p.business_id = $2::uuid
    `;

    if (minScore !== null) {
      params.push(minScore);
      sql += ` AND p.lead_score >= $${params.length}`;
    }

    sql += ` ORDER BY p.lead_score DESC, a.created_at DESC`;

    const { rows } = await pool.query(sql, params);
    return Response.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSchemaError =
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("column");

    if (isSchemaError) {
      return Response.json(
        {
          error_code: "SCHEMA_NOT_MIGRATED",
          message: "Consulting Revenue OS schema not migrated.",
          detail: "Run migrations 280 and 281.",
        },
        { status: 503 },
      );
    }

    console.error("[bos.consulting.leads] failed", {
      envId,
      businessId,
      error: message,
    });

    return Response.json(
      {
        error_code: "INTERNAL_ERROR",
        message: "Failed to load consulting leads.",
      },
      { status: 500 },
    );
  }
}
