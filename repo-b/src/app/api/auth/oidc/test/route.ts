import { NextRequest, NextResponse } from "next/server";

import { isAdminSession } from "@/lib/server/sessionRole";
import { testIdentityProvider } from "@/lib/server/identityProviders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminSession()) {
    return NextResponse.json({ error: "admin required" }, { status: 403 });
  }
  let body: { provider_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.provider_id) {
    return NextResponse.json({ error: "provider_id required" }, { status: 400 });
  }
  try {
    const result = await testIdentityProvider(
      body.provider_id,
      request.headers.get("cookie"),
    );
    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
