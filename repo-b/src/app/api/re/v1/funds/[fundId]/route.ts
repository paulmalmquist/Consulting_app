import { NextRequest } from "next/server";
import { proxyToBos } from "@/lib/server/bosProxy";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "GET, OPTIONS" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { fundId: string } }
) {
  return proxyToBos(request, "/api/re/v1/funds/" + params.fundId);
}
