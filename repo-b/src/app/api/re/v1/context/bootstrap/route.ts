import { NextRequest } from "next/server";
import { proxyToBos } from "@/lib/server/bosProxy";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return proxyToBos(request, "/api/re/v1/context/bootstrap");
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  return proxyToBos(request, "/api/re/v1/context/bootstrap" + url.search);
}
