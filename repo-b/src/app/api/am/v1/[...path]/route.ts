import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

function buildUpstream(req: NextRequest, path: string[]): string {
  const search = req.nextUrl.search;
  const joined = path.join("/");
  return `/api/am/v1/${joined}${search}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyOrFail(request, buildUpstream(request, path));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyOrFail(request, buildUpstream(request, path));
}
