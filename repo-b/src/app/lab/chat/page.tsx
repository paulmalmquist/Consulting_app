"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  clearChatState,
  ensureLabConversation,
  genSessionId,
  loadStoredConversationId,
  messagesKey,
  sessionKey,
} from "./chatState";

type ChatCitation = {
  doc_id: string;
  filename: string;
  chunk_id: string;
  snippet: string;
  score?: number;
};

type ToolCallInfo = {
  tool_name: string;
  result_preview: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  tool_calls?: ToolCallInfo[];
  suggested_actions?: Array<Record<string, unknown>>;
  streaming?: boolean;
};

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(
    () => [
      "What is the TVPI for the Meridian Value Fund?",
      "Summarize the key risks in the latest IC memo.",
      "Show me assets with DSCR below 1.2x.",
      "What are the waterfall terms for Fund III?",
      "List all documents uploaded in the last 30 days.",
    ],
    []
  );

  useEffect(() => {
    const envId = selectedEnv?.env_id;
    if (!envId) {
      setMessages([]);
      setSessionId(null);
      setConversationId(null);
      setError(null);
      return;
    }

    setMessages(loadMessages(envId));
    setConversationId(loadStoredConversationId(envId));
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
    // Don't persist streaming messages
    const toSave = messages.filter((m) => !m.streaming);
    try {
      localStorage.setItem(messagesKey(envId), JSON.stringify(toSave));
    } catch {
      // ignore storage failures
    }
  }, [messages, selectedEnv?.env_id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || !selectedEnv) return;

    const userMessage: ChatMessage = { role: "user", content: input };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    const sentInput = input;
    setInput("");
    setLoading(true);
    setError(null);

    let assistantText = "";
    const citations: ChatCitation[] = [];
    const toolCalls: ToolCallInfo[] = [];

    try {
      const activeConversationId = await ensureLabConversation({
        env: selectedEnv,
        existingConversationId: conversationId,
        route: typeof window !== "undefined" ? window.location.pathname : "/lab/chat",
      });
      setConversationId(activeConversationId);

      const res = await fetch("/api/ai/gateway/ask", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sentInput,
          business_id: selectedEnv.business_id,
          env_id: selectedEnv.env_id,
          session_id: sessionId ?? undefined,
          conversation_id: activeConversationId,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Gateway error ${res.status}: ${errBody.slice(0, 200)}`);
      }

      // Add streaming placeholder
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "", streaming: true },
      ]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === "token") {
                assistantText += data.text;
                setMessages([
                  ...nextMessages,
                  {
                    role: "assistant",
                    content: assistantText,
                    citations: [...citations],
                    tool_calls: [...toolCalls],
                    streaming: true,
                  },
                ]);
              } else if (currentEvent === "citation" && data.chunk_id) {
                citations.push({
                  doc_id: data.doc_id,
                  filename: data.doc_id?.slice(0, 8) + "...",
                  chunk_id: data.chunk_id,
                  snippet: data.snippet,
                  score: data.score,
                });
              } else if (currentEvent === "tool_call") {
                toolCalls.push({
                  tool_name: data.tool_name,
                  result_preview: data.result_preview,
                });
                setMessages([
                  ...nextMessages,
                  {
                    role: "assistant",
                    content: assistantText || "Calling tools...",
                    citations: [...citations],
                    tool_calls: [...toolCalls],
                    streaming: true,
                  },
                ]);
              } else if (currentEvent === "done") {
                // Final message — no longer streaming
                setMessages([
                  ...nextMessages,
                  {
                    role: "assistant",
                    content: assistantText,
                    citations: citations.length > 0 ? citations : undefined,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                  },
                ]);
              } else if (currentEvent === "error") {
                throw new Error(data.message || "Gateway error");
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.startsWith("Gateway")) {
                throw parseErr;
              }
              // Skip malformed SSE data lines
            }
            currentEvent = "";
          }
        }
      }

      // If stream ended without a "done" event, finalize
      if (assistantText) {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: assistantText,
            citations: citations.length > 0 ? citations : undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chat failed";
      setError(message);
      if (!assistantText) {
        setMessages(nextMessages);
      }
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (!selectedEnv) return;
    const envId = selectedEnv.env_id;
    clearChatState(envId);
    const next = genSessionId();
    try {
      localStorage.setItem(sessionKey(envId), next);
    } catch {
      // ignore storage failures
    }
    setSessionId(next);
    setConversationId(null);
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
                  AI-powered document Q&A with semantic search and tool calling.
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

            <div ref={scrollRef} className="mt-6 flex-1 space-y-4 overflow-y-auto max-h-[60vh]">
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

                  {/* Tool call indicators */}
                  {message.tool_calls && message.tool_calls.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {message.tool_calls.map((tc, i) => (
                        <div
                          key={i}
                          className="text-xs font-mono px-2 py-1 rounded bg-bm-accent/10 border border-bm-accent/30"
                        >
                          <span className="text-bm-accent font-semibold">{tc.tool_name}</span>
                          <span className="text-bm-muted2 ml-2">{tc.result_preview.slice(0, 100)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Citations */}
                  {message.citations && message.citations.length > 0 ? (
                    <div className="mt-3 text-xs text-bm-muted space-y-2">
                      <p className="font-semibold">Sources ({message.citations.length})</p>
                      {message.citations.map((citation) => (
                        <div
                          key={citation.chunk_id}
                          className="border border-bm-border/70 rounded-lg p-2 bg-bm-bg/20"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">Doc: {citation.filename}</span>
                            {citation.score != null ? (
                              <span className="text-bm-muted2">
                                score: {citation.score.toFixed(3)}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-bm-muted2 mt-1">{citation.snippet}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Streaming indicator */}
                  {message.streaming ? (
                    <span className="inline-block mt-1 w-2 h-4 bg-bm-accent animate-pulse rounded-sm" />
                  ) : null}
                </div>
              ))}
              {messages.length === 0 ? (
                <p className="text-sm text-bm-muted2">
                  No messages for this environment yet. Try a guided prompt.
                </p>
              ) : null}
            </div>

            {error ? <p className="mt-4 text-sm text-bm-danger">{error}</p> : null}

            <form onSubmit={sendMessage} className="mt-4 flex gap-2">
              <Input
                className="flex-1"
                placeholder="Ask about funds, assets, or documents..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-1">
                    <span className="animate-pulse">Thinking</span>
                  </span>
                ) : (
                  "Send"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <CardTitle>Guided Prompts</CardTitle>
            <CardDescription>
              Try RE investment questions — powered by RAG + MCP tools.
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
                  &ldquo;{p}&rdquo;
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </EnvGate>
  );
}
