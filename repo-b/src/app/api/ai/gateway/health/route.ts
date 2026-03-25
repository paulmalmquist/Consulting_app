import { NextRequest, NextResponse } from "next/server";
import { hasSession, getSessionActor, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(req: NextRequest) {
  if (!hasSession(req)) {
    return unauthorizedJson();
  }

  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/health`, {
      headers: { "x-bm-actor": getSessionActor(req) },
    });
    const data = await upstream.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { enabled: false, model: "unknown", embedding_model: "unknown", rag_available: false, message: "Backend unreachable" },
      { status: 502 }
    );
  }
}
