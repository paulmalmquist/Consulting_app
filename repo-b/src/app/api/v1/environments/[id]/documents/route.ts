import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  return proxyOrFail(request, `/v1/environments/${params.id}/documents${url.search}`);
}
