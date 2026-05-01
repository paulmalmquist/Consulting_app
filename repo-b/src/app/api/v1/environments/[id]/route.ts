import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") {
    return Response.json({
      env_id: params.id,
      slug: null,
      client_name: "Test Environment",
      industry: "real_estate",
      industry_type: "repe",
      workspace_template_key: "repe",
      schema_name: `env_${params.id.replace(/-/g, "_")}`,
      auth_mode: "private",
      is_active: true,
      business_id: "b1b2c3d4-0001-0001-0001-000000000001",
      repe_initialized: true,
    });
  }
  return proxyOrFail(request, "/v1/environments/" + params.id);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFail(request, "/v1/environments/" + params.id);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFail(request, "/v1/environments/" + params.id);
}
