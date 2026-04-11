import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";
import {
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

async function requireAdminSession(request: NextRequest) {
  const session = await parseSessionFromRequest(request);
  if (!session || !isPlatformAdminSession(session)) {
    return null;
  }
  return session;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { proposalId: string } },
) {
  const session = await requireAdminSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const { proposalId } = params;
  if (!proposalId || typeof proposalId !== "string") {
    return NextResponse.json(
      { error: "proposalId is required" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const decision = url.searchParams.get("decision");
  if (!decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }

  const target =
    `${FASTAPI_BASE}/api/admin/ai/prompt-policy-proposals/` +
    `${encodeURIComponent(proposalId)}/decision?decision=${decision}`;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await buildPlatformSessionHeaders(req)),
      },
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach backend";
    return NextResponse.json(
      { error: `Proxy error: ${message}` },
      { status: 502 },
    );
  }
}
