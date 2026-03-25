import { NextResponse } from "next/server";
import { PUBLIC_ASSISTANT_PROMPT_VERSION } from "@/lib/public-assistant/prompt";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: "public_read_only",
    prompt_version: PUBLIC_ASSISTANT_PROMPT_VERSION,
  });
}
