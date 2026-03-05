import { NextResponse } from "next/server";
import { buildContextSnapshot } from "@/lib/server/mcpContext";
import { resolveRequestId, traceLog, withRequestId } from "@/lib/server/requestTrace";
import { hasSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);
  if (!hasSession(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, ...withRequestId(requestId) });
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

  traceLog("commands.context_snapshot", {
    request_id: requestId,
    route,
    env_id: currentEnvId,
    business_id: businessId,
  });

  return NextResponse.json(snapshot, withRequestId(requestId));
}
