import { NextRequest } from "next/server";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { envId: string } }
) {
  return proxyOrFallback(request, `/v1/env/${params.envId}/health`, async () =>
    Response.json({
      business_exists: true,
      modules_initialized: true,
      repe_status: "initialized",
      data_integrity: true,
      content_count: 0,
      ranking_count: 0,
      analytics_count: 0,
      crm_count: 0,
    })
  );
}

