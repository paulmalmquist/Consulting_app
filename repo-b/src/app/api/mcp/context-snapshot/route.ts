import { NextResponse } from "next/server";
import { buildContextSnapshot } from "@/lib/server/mcpContext";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasDemoSession(request)) {
    return unauthorizedJson();
  }
  const url = new URL(request.url);
  const route = url.searchParams.get("route");
  const currentEnvId = url.searchParams.get("currentEnvId");
  const businessId = url.searchParams.get("businessId");

  const snapshot = await buildContextSnapshot({
    origin: url.origin,
    route,
    currentEnvId,
    businessId,
  });

  return NextResponse.json(snapshot);
}
