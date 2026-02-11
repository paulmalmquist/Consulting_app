import { NextResponse } from "next/server";
import { askOnce, createRunAndStart, isLocalAiEnabled } from "@/lib/server/codexBridge";

export const runtime = "nodejs";

type RunRequest = {
  contextKey?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  if (!isLocalAiEnabled()) {
    return NextResponse.json(
      { error: "Local Codex routes are disabled. Set AI_MODE=local." },
      { status: 403 }
    );
  }

  const payload = (await request.json()) as RunRequest;
  const prompt = (payload.prompt || "").trim();
  const contextKey = (payload.contextKey || "global").trim() || "global";

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  // In serverless production, in-memory run state can be split across invocations.
  // Return a direct answer for reliability, while keeping run+stream for local dev.
  if (process.env.VERCEL === "1") {
    try {
      const answer = await askOnce(prompt);
      return NextResponse.json({ answer });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "AI run failed." },
        { status: 503 }
      );
    }
  }

  const run = createRunAndStart(contextKey, prompt);
  return NextResponse.json({ runId: run.runId });
}
