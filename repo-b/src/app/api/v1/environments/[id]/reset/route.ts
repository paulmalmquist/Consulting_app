import { NextRequest } from "next/server";
import { resetFallbackEnvironment } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/environments/${params.id}/reset`, async () => {
    resetFallbackEnvironment(params.id);
    return Response.json({ ok: true, message: "Environment reset and reseeded." });
  });
}
