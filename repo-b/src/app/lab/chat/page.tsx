"use client";

import { useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";

type ChatCitation = {
  doc_id: string;
  filename: string;
  chunk_id: string;
  snippet: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  suggested_actions?: Array<Record<string, unknown>>;
};

export default function ChatPage() {
  const { selectedEnv } = useEnv();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || !selectedEnv) return;

    const userMessage: ChatMessage = { role: "user", content: input };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<{
        answer: string;
        citations: ChatCitation[];
        suggested_actions: Array<Record<string, unknown>>;
      }>("/v1/chat", {
        method: "POST",
        body: JSON.stringify({
          env_id: selectedEnv.env_id,
          message: input
        })
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        suggested_actions: response.suggested_actions
      };
      setMessages([...nextMessages, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chat failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[2fr,1fr] gap-6">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col">
        <h1 className="text-xl font-semibold">RAG Chat</h1>
        <p className="text-sm text-slate-400 mt-2">
          Ask questions about documents and structured records.
        </p>
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`p-4 rounded-xl border ${
                message.role === "user"
                  ? "border-sky-500/40 bg-sky-500/10"
                  : "border-slate-800 bg-slate-950"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              {message.citations && message.citations.length > 0 ? (
                <div className="mt-3 text-xs text-slate-400 space-y-2">
                  {message.citations.map((citation) => (
                    <div
                      key={citation.chunk_id}
                      className="border border-slate-800 rounded-lg p-2"
                    >
                      <p className="font-semibold">
                        {citation.filename} · {citation.chunk_id}
                      </p>
                      <p className="text-slate-500">{citation.snippet}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {message.suggested_actions &&
              message.suggested_actions.length > 0 ? (
                <div className="mt-3 text-xs text-amber-300">
                  Suggested actions pending HITL approval.
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {error ? (
          <p className="mt-4 text-sm text-red-300">{error}</p>
        ) : null}
        <form onSubmit={sendMessage} className="mt-4 flex gap-2">
          <input
            className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            placeholder="Ask a question..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold"
          >
            {loading ? "Sending" : "Send"}
          </button>
        </form>
      </section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Guided Prompts</h2>
        <p className="text-sm text-slate-400 mt-2">
          Ask for summaries, risk highlights, or draft actions.
        </p>
        <ul className="mt-4 text-sm text-slate-300 space-y-3">
          <li>“Summarize the key policies in the uploaded docs.”</li>
          <li>“Create a ticket for the highest risk issue.”</li>
          <li>“List approvals waiting in the queue.”</li>
        </ul>
      </section>
    </div>
  );
}
