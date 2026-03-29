import type { NextRequest } from "next/server";

import { proxyToBos } from "@/lib/server/bosProxy";

export async function proxyOrFallback(
  request: NextRequest,
  upstreamPath: string,
  _fallback: () => Promise<Response> | Response
) {
  return proxyToBos(request, upstreamPath);
}

export async function proxyOrFail(request: NextRequest, upstreamPath: string) {
  return proxyToBos(request, upstreamPath);
}
