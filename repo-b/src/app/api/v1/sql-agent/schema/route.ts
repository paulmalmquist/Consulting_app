import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const path = domain
    ? `/api/sql-agent/schema?domain=${domain}`
    : "/api/sql-agent/schema";
  return proxyOrFail(request, path);
}
