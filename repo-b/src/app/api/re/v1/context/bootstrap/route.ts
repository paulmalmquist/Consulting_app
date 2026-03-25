import { NextRequest } from "next/server";

export const runtime = "nodejs";

function resolveEnvId(request: NextRequest): string | null {
  const url = new URL(request.url);
  return (
    url.searchParams.get("env_id") ||
    request.headers.get("x-env-id") ||
    null
  );
}

function resolveBusinessId(request: NextRequest, envId: string): string {
  const url = new URL(request.url);
  return url.searchParams.get("business_id") || envId;
}

function missingEnv() {
  return Response.json(
    {
      error_code: "MISSING_ENV_ID",
      message: "env_id is required",
    },
    { status: 400 }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "POST, OPTIONS" },
  });
}

export async function POST(request: NextRequest) {
  const envId = resolveEnvId(request);
  if (!envId) return missingEnv();

  return Response.json({
    env_id: envId,
    business_id: resolveBusinessId(request, envId),
    industry: "real_estate",
    is_bootstrapped: true,
    funds_count: 0,
    scenarios_count: 0,
  });
}

