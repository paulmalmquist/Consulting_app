import { NextResponse } from "next/server";
import {
  createRunAndStart,
  isLocalAiEnabled,
  runPromptDirect,
} from "@/lib/server/codexBridge";

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

  // Vercel/serverless does not guarantee shared in-memory run state across
  // /run and /stream invocations. Return direct output in that environment.
  if (process.env.VERCEL === "1") {
    const result = await runPromptDirect(prompt);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Run failed" }, { status: 502 });
    }
    return NextResponse.json({ output: result.output, mode: "direct" });
  }

  const run = createRunAndStart(contextKey, prompt);
  return NextResponse.json({ runId: run.runId });
}
