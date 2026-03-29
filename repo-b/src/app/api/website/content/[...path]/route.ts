import { NextRequest } from "next/server";

import { proxyToBos } from "@/lib/server/bosProxy";

export const runtime = "nodejs";

async function proxy(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(request.url);
  const upstreamPath = `/api/website/content/${(path || []).join("/")}${url.search}`;
  return proxyToBos(request, upstreamPath);
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
