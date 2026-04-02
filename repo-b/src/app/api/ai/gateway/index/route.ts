/**
 * RAG index proxy: browser → Next.js → FastAPI AI Gateway
 *
 * Triggers document indexing for RAG search after upload.
 */
import { NextRequest, NextResponse } from "next/server";
import { hasSession, unauthorizedJson } from "@/lib/server/sessionAuth";
import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  if (!(await hasSession(req))) {
    return unauthorizedJson();
  }

  try {
    const body = await req.text();
    const platformHeaders = await buildPlatformSessionHeaders(req);
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...platformHeaders,
      },
      body,
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 }
    );
  }
}
