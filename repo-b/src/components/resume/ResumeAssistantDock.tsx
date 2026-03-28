"use client";

import { useMemo, useState } from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import { askResumeAssistant } from "@/lib/bos-api";
import ResponseBlockRenderer from "@/components/winston/ResponseBlockRenderer";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

type ResumeAssistantMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; blocks: AssistantResponseBlock[] };

const STARTERS: Record<string, string[]> = {
  timeline: [
    "Show me the turning point in Paul's career",
    "What systems marked the biggest scope jump?",
  ],
  architecture: [
    "Explain how the warehouse turns into AI",
    "Which nodes map to the Kayne platform?",
  ],
  modeling: [
    "Explain this waterfall",
    "What drives IRR here?",
  ],
  bi: [
    "Show me top performing assets",
    "What makes this dashboard useful to executives?",
  ],
};

export default function ResumeAssistantDock({
  envId,
  businessId,
  metrics,
}: {
  envId: string;
  businessId: string | null;
  metrics: Record<string, string | number>;
}) {
  const [messages, setMessages] = useState<ResumeAssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);

  const {
    activeModule,
    buildAssistantContext,
  } = useResumeWorkspaceStore((state) => ({
    activeModule: state.activeModule,
    buildAssistantContext: state.buildAssistantContext,
  }));

  const starters = useMemo(() => STARTERS[activeModule] ?? STARTERS.timeline, [activeModule]);

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setInput("");

    try {
      const context = buildAssistantContext();
      const response = await askResumeAssistant({
        env_id: envId,
        business_id: businessId,
        query: trimmed,
        context: {
          ...context,
          metrics,
        },
      });
      setSuggestedQuestions(response.suggested_questions ?? []);
      setMessages((previous) => [...previous, { role: "assistant", blocks: response.blocks }]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          blocks: [
            {
              type: "error",
              block_id: "resume-assistant-error",
              title: "Assistant unavailable",
              message: "The contextual assistant failed to respond. Please try again.",
              recoverable: true,
            },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/35 p-5">
      <p className="bm-section-label">Assistant</p>
      <h2 className="mt-2 text-xl">Context-aware explanation layer</h2>
      <p className="mt-2 text-sm text-bm-muted">
        Grounded in the current module instead of free-floating markdown responses.
      </p>

      {messages.length === 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => sendQuestion(starter)}
              className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-muted transition hover:border-white/25 hover:text-bm-text"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-sky-500/20 px-4 py-3 text-sm text-sky-50">{message.text}</div>
            </div>
          ) : (
            <div key={index} className="space-y-3">
              {message.blocks.map((block) => (
                <div key={block.block_id} className="rounded-2xl border border-bm-border/30 bg-black/10 p-4">
                  <ResponseBlockRenderer block={block} />
                </div>
              ))}
            </div>
          ),
        )}
        {loading ? <div className="text-sm text-bm-muted2">Analyzing current context...</div> : null}
      </div>

      {(suggestedQuestions.length > 0 || messages.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestedQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => sendQuestion(question)}
              className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-muted transition hover:border-white/25 hover:text-bm-text"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendQuestion(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about the current timeline, architecture, model, or BI slice..."
          className="flex-1 rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-3 text-sm text-bm-text placeholder:text-bm-muted2 focus:border-white/25 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-2xl border border-sky-400/30 bg-sky-500/15 px-4 py-3 text-sm text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
