import { getRun } from "@/lib/server/codexRunStore";
import { aiMode, isLocalAiEnabled } from "@/lib/server/codexBridge";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

function sseLine(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  if (!hasDemoSession(request)) {
    return unauthorizedJson();
  }
  if (!isLocalAiEnabled()) {
    return new Response(
      JSON.stringify({ error: "Local Codex routes are disabled.", mode: aiMode() }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return new Response(JSON.stringify({ error: "runId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const run = getRun(runId);
  if (!run) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let cursor = 0;

      const pump = () => {
        const next = getRun(runId);
        if (!next) {
          controller.enqueue(
            encoder.encode(sseLine("error", { message: "Run expired or missing." }))
          );
          controller.close();
          return;
        }

        while (cursor < next.events.length) {
          const event = next.events[cursor];
          cursor += 1;
          controller.enqueue(encoder.encode(sseLine(event.type, event.payload)));
        }

        controller.enqueue(
          encoder.encode(
            sseLine("status", {
              state: next.status,
              output: next.output,
            })
          )
        );

        if (next.status !== "running") {
          controller.close();
          return;
        }

        setTimeout(pump, 180);
      };

      pump();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
