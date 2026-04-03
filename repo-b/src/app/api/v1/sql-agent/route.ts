import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

/** POST /api/v1/sql-agent → backend POST /api/sql-agent/query */
export async function POST(request: NextRequest) {
  return proxyOrFail(request, "/api/sql-agent/query");
}

/** GET /api/v1/sql-agent → backend GET /api/sql-agent/health */
export async function GET(request: NextRequest) {
  return proxyOrFail(request, "/api/sql-agent/health");
}
