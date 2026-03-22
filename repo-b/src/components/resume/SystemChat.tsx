"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Walk me through the system architecture",
  "What data platforms has Paul deployed?",
  "Compare the Kayne Anderson and JLL deployments",
  "What's the ROI on the automation work?",
  "How does Winston's AI layer work?",
  "What would Paul build for our firm?",
];

export default function SystemChat({
  envId,
  businessId,
}: {
  envId: string;
  businessId: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/bos/api/resume/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          env_id: envId,
          business_id: businessId || "",
        }),
      });

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
        ]);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          // Vercel AI SDK format: 0:"text content"
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              assistantContent += text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            } catch {
              // skip unparseable chunks
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    }

    setStreaming(false);
  }

  return (
    <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-bm-muted2">
        System Chat
      </h2>
      <p className="mb-4 text-sm text-bm-muted">
        Ask about any capability, deployment, or metric
      </p>

      {/* Starter prompts (shown when no messages) */}
      {messages.length === 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="rounded-full border border-bm-border/70 px-3 py-1.5 text-xs text-bm-muted hover:border-sky-500/50 hover:text-sky-400 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Message area */}
      <div
        ref={scrollRef}
        className="h-[320px] overflow-y-auto rounded-lg border border-bm-border/30 bg-black/20 p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-bm-muted2">
              Select a question above or type your own below
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${msg.role === "user" ? "text-right" : ""}`}
          >
            <div
              className={`inline-block max-w-[85%] rounded-xl px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-sky-500/20 text-sky-100"
                  : "bg-bm-surface/30 text-bm-muted"
              }`}
            >
              {msg.role === "assistant" ? (
                <div
                  className="prose prose-invert prose-sm max-w-none [&_table]:text-xs [&_th]:text-left [&_td]:py-1 [&_th]:py-1 [&_h2]:text-sm [&_h2]:mt-0"
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdown(msg.content || "Thinking..."),
                  }}
                />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {streaming && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-sm text-bm-muted2">
            <span className="animate-pulse">Analyzing...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about architecture, deployments, or metrics..."
          disabled={streaming}
          className="flex-1 rounded-lg border border-bm-border/50 bg-bm-surface/20 px-4 py-2 text-sm text-bm-muted placeholder:text-bm-muted2 focus:border-sky-500/50 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-xs font-medium text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </div>
  );
}

/** Minimal markdown → HTML for chat responses */
function formatMarkdown(text: string): string {
  return text
    // Headers
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold mb-2">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Tables (basic)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) return "";
      const isHeader = match.includes("---");
      if (isHeader) return "";
      const tag = "td";
      return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
    })
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Line breaks
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}
