"use client";

import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import { askResumeAssistant } from "@/lib/bos-api";
import { logError } from "@/lib/logging/logger";
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
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      activeModule: state.activeModule,
      buildAssistantContext: state.buildAssistantContext,
    })),
  );

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
    } catch (error) {
      logError("resume.assistant_error", "Resume assistant request failed", {
        env_id: envId,
        business_id: businessId,
        error_message: error instanceof Error ? error.message : "Unknown assistant error",
      });
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
    <section className="rounded-[20px] border border-bm-border/60 bg-bm-surface/35 p-3 md:rounded-[28px] md:p-4">
      <p className="bm-section-label tracking-[0.1em] md:tracking-[0.16em]">Assistant</p>
      <p className="mt-1 text-xs text-bm-muted">
        Context-aware — grounded in the active module.
      </p>

      {messages.length === 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => sendQuestion(starter)}
              className="rounded-full border border-bm-border/35 bg-white/5 px-2.5 py-1 text-[11px] text-bm-muted transition hover:border-white/25 hover:text-bm-text"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 max-h-[200px] space-y-2 overflow-y-auto pr-1 md:mt-3 md:max-h-[320px] md:space-y-3">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl bg-sky-500/20 px-3 py-2 text-xs text-sky-50">{message.text}</div>
            </div>
          ) : (
            <div key={index} className="space-y-2">
              {message.blocks.map((block) => (
                <div key={block.block_id} className="rounded-xl border border-bm-border/30 bg-black/10 p-3">
                  <ResponseBlockRenderer block={block} />
                </div>
              ))}
            </div>
          ),
        )}
        {loading ? <div className="text-xs text-bm-muted2">Analyzing context...</div> : null}
      </div>

      {suggestedQuestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestedQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => sendQuestion(question)}
              className="rounded-full border border-bm-border/35 bg-white/5 px-2.5 py-1 text-[11px] text-bm-muted transition hover:border-white/25 hover:text-bm-text"
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
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about this module..."
          className="flex-1 rounded-xl border border-bm-border/35 bg-black/10 px-3 py-2 text-xs text-bm-text placeholder:text-bm-muted2 focus:border-white/25 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
