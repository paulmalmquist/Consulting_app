import { NextRequest } from "next/server";
import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

type EnvironmentRow = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string | null;
  business_id: string | null;
  is_active: boolean;
  notes: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: { envId: string } }
) {
  if (!UUID_RE.test(params.envId)) {
    return Response.json({ message: "Invalid environment id." }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) {
    return Response.json(
      { message: "Environment context unavailable: DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const { rows } = await pool.query<EnvironmentRow>(
      `SELECT env_id::text,
              client_name,
              industry,
              COALESCE(industry_type, industry) AS industry_type,
              business_id::text,
              is_active,
              notes
         FROM app.environments
        WHERE env_id = $1::uuid
        LIMIT 1`,
      [params.envId]
    );
    const env = rows[0];
    if (!env) {
      return Response.json({ message: "Environment not found." }, { status: 404 });
    }

    const businessId = await resolveBusinessId(
      pool,
      params.envId,
      env.business_id || null
    );
    if (!businessId) {
      return Response.json(
        { message: "Environment is not bound to a business." },
        { status: 409 }
      );
    }

    return Response.json({
      env_id: env.env_id,
      client_name: env.client_name,
      industry: env.industry,
      industry_type: env.industry_type || env.industry,
      business_id: businessId,
      is_active: env.is_active,
      notes: env.notes,
    });
  } catch {
    return Response.json(
      { message: "Failed to resolve environment context." },
      { status: 500 }
    );
  }
}
