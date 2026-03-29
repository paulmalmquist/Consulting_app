import { NextResponse } from "next/server";

import {
  findMembershipByEnvId,
  getActiveMembership,
  parseSessionFromRequest,
  type PlatformMembershipSummary,
} from "@/lib/server/sessionAuth";

export async function requireTradingMembership(
  request: Request,
  requestedEnvId?: string | null,
) {
  const session = await parseSessionFromRequest(request);
  if (!session) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const membership = requestedEnvId
    ? findMembershipByEnvId(session, requestedEnvId)
    : getActiveMembership(session);

  if (!membership || membership.env_slug !== "trading" || membership.status !== "active") {
    return { error: NextResponse.json({ error: "Trading environment access required" }, { status: 403 }) };
  }

  if (!membership.tenant_id) {
    return { error: NextResponse.json({ error: "Trading environment tenant is not configured" }, { status: 400 }) };
  }

  return { membership: membership as PlatformMembershipSummary };
}

export function tradingWriteAllowed(role: string) {
  return role === "owner" || role === "admin" || role === "member";
}
