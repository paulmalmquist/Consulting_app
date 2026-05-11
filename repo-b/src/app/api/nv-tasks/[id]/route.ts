import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE = process.env.BOS_API_ORIGIN || "http://127.0.0.1:8000";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const upstreamUrl = new URL(`/api/nv-tasks/${params.id}`, API_BASE);

  try {
    const body = await request.text();
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "PATCH",
      body,
      cache: "no-store",
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/json",
      },
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "NV Tasks backend unavailable." },
      { status: 503 }
    );
  }
}
