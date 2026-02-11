import { NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE =
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

export async function GET() {
  try {
    const res = await fetch(new URL("/api/ai/health", API_BASE), { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));
    return NextResponse.json(payload, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: "error", mode: "local", message: "Backend AI health unavailable." },
      { status: 503 }
    );
  }
}
