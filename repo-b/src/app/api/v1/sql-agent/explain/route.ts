import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyOrFail(request, "/api/sql-agent/explain");
}
