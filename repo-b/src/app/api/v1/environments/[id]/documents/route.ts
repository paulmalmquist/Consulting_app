import { NextRequest } from "next/server";
import { listFallbackDocuments } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  return proxyOrFallback(
    request,
    `/v1/environments/${params.id}/documents${url.search}`,
    async () => {
      return Response.json({ documents: listFallbackDocuments(params.id) });
    }
  );
}
