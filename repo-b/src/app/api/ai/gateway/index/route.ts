/**
 * RAG index proxy: browser → Next.js → FastAPI AI Gateway
 *
 * Triggers document indexing for RAG search after upload.
 */
import { NextRequest, NextResponse } from "next/server";
import { hasSession, getSessionActor, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  if (!hasSession(req)) {
    return unauthorizedJson();
  }

  try {
    const body = await req.text();
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bm-actor": getSessionActor(req),
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
