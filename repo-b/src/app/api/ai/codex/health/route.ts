import { NextResponse } from "next/server";
import { checkSidecarHealth } from "@/lib/server/codexBridge";

export const runtime = "nodejs";

export async function GET() {
  const health = await checkSidecarHealth();
  return NextResponse.json(health);
}
