import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { envId: string } }
) {
  return proxyOrFail(request, "/v1/env/" + params.envId + "/health");
}
