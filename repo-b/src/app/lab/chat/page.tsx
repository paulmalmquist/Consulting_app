"use client";

import { useEffect, useMemo, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

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

function messagesKey(envId: string) {
  return `demo_lab_chat_messages:${envId}`;
}

function sessionKey(envId: string) {
  return `demo_lab_chat_session:${envId}`;
}

function genSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `sess_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function loadMessages(envId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(messagesKey(envId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export default function ChatPage() {
  const { selectedEnv } = useEnv();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompts = useMemo(
    () => [
      "Summarize the key policies in the uploaded docs.",
      "Create a ticket for the highest risk issue.",
      "List approvals waiting in the queue."
    ],
    []
  );

  useEffect(() => {
    const envId = selectedEnv?.env_id;
    if (!envId) {
      setMessages([]);
      setSessionId(null);
      setError(null);
      return;
    }

    setMessages(loadMessages(envId));
    setError(null);

    try {
      const existing = localStorage.getItem(sessionKey(envId));
      if (existing) {
        setSessionId(existing);
      } else {
        const next = genSessionId();
        localStorage.setItem(sessionKey(envId), next);
        setSessionId(next);
      }
    } catch {
      setSessionId(genSessionId());
    }
  }, [selectedEnv?.env_id]);

  useEffect(() => {
    const envId = selectedEnv?.env_id;
    if (!envId) return;
    try {
      localStorage.setItem(messagesKey(envId), JSON.stringify(messages));
    } catch {
      // ignore storage failures (private mode/quota)
    }
  }, [messages, selectedEnv?.env_id]);

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
          session_id: sessionId ?? undefined,
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

  const clearChat = () => {
    if (!selectedEnv) return;
    const envId = selectedEnv.env_id;
    try {
      localStorage.removeItem(messagesKey(envId));
      localStorage.removeItem(sessionKey(envId));
      const next = genSessionId();
      localStorage.setItem(sessionKey(envId), next);
      setSessionId(next);
    } catch {
      setSessionId(genSessionId());
    }
    setMessages([]);
    setError(null);
    setInput("");
  };

  return (
    <EnvGate>
      <div className="grid lg:grid-cols-[2fr,1fr] gap-6">
        <Card className="flex flex-col">
          <CardContent className="flex flex-col flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">RAG Chat</CardTitle>
                <CardDescription>
                  Ask questions about documents and structured records.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={clearChat}
              >
                Clear chat
              </Button>
            </div>

            <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "p-4 rounded-xl border",
                    message.role === "user"
                      ? "border-bm-accent/35 bg-bm-accent/10"
                      : "border-bm-border/70 bg-bm-surface/40"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.citations && message.citations.length > 0 ? (
                    <div className="mt-3 text-xs text-bm-muted space-y-2">
                      {message.citations.map((citation) => (
                        <div
                          key={citation.chunk_id}
                          className="border border-bm-border/70 rounded-lg p-2 bg-bm-bg/20"
                        >
                          <p className="font-semibold">
                            {citation.filename} · {citation.chunk_id}
                          </p>
                          <p className="text-bm-muted2">{citation.snippet}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {message.suggested_actions &&
                  message.suggested_actions.length > 0 ? (
                    <div className="mt-3 text-xs text-bm-warning">
                      Suggested actions pending HITL approval.
                    </div>
                  ) : null}
                </div>
              ))}
              {messages.length === 0 ? (
                <p className="text-sm text-bm-muted2">
                  No messages for this environment yet.
                </p>
              ) : null}
            </div>

            {error ? <p className="mt-4 text-sm text-bm-danger">{error}</p> : null}

            <form onSubmit={sendMessage} className="mt-4 flex gap-2">
              <Input
                className="flex-1"
                placeholder="Ask a question..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Sending" : "Send"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <CardTitle>Guided Prompts</CardTitle>
            <CardDescription>
              Ask for summaries, risk highlights, or draft actions.
            </CardDescription>
            <div className="mt-4 space-y-2">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInput(p)}
                  className={buttonVariants({
                    variant: "secondary",
                    className: "w-full justify-start h-auto py-3 text-left font-medium",
                  })}
                >
                  “{p}”
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </EnvGate>
  );
}
