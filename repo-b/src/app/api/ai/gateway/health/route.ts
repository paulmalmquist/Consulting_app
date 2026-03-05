import { NextRequest, NextResponse } from "next/server";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.DEMO_API_ORIGIN ||
  process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(req: NextRequest) {
  if (!hasDemoSession(req)) {
    return unauthorizedJson();
  }

  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/health`, {
      headers: { "x-bm-actor": "demo_user" },
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
