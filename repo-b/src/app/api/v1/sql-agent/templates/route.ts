import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const path = domain
    ? `/api/sql-agent/templates?domain=${domain}`
    : "/api/sql-agent/templates";
  return proxyOrFail(request, path);
}

export async function POST(request: NextRequest) {
  return proxyOrFail(request, "/api/sql-agent/templates/run");
}
