import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return proxyOrFail(request, "/v1/environments" + url.search);
}

export async function POST(request: NextRequest) {
  return proxyOrFail(request, "/v1/environments");
}
