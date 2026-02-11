import { NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE =
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const res = await fetch(new URL("/api/ai/ask", API_BASE), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    return NextResponse.json(payload, { status: res.status });
  } catch {
    return NextResponse.json(
      { detail: "Backend AI ask route unavailable." },
      { status: 503 }
    );
  }
}
