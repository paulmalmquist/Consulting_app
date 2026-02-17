import { NextResponse } from "next/server";
import { checkSidecarHealth } from "@/lib/server/codexBridge";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasDemoSession(request)) {
    return unauthorizedJson();
  }
  const health = await checkSidecarHealth();
  return NextResponse.json(health);
}
