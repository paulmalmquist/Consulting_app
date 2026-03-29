import { NextRequest } from "next/server";
import { proxyToBos } from "@/lib/server/bosProxy";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return proxyToBos(request, "/api/re/v1/funds");
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return proxyToBos(request, "/api/re/v1/funds" + url.search);
}

export async function POST(request: NextRequest) {
  return proxyToBos(request, "/api/re/v1/funds");
}
