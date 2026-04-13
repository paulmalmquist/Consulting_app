"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 30;

export default function RichardResumeChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || suggestionsLoaded) return;
    setSuggestionsLoaded(true);
    fetch("/api/resume/suggestions?scope=richard")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
      })
      .catch(() => {});
  }, [isOpen, suggestionsLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming) return;
    if (messages.length >= MAX_MESSAGES) return;

    setError(null);
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/resume/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          mode: "public_resume",
          scope: "richard",
          user: "public",
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") ?? "60";
        setError(`Too many requests — please wait ${retryAfter}s.`);
        setMessages(next);
        setIsStreaming(false);
        return;
      }

      if (!response.ok || !response.body) {
        setError("Something went wrong — try again.");
        setMessages(next);
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("0:")) continue;
          try {
            assistantText += JSON.parse(trimmed.slice(2)) as string;
            setMessages([...next, { role: "assistant", content: assistantText }]);
          } catch {
            // ignore malformed chunk
          }
        }
      }

      if (!assistantText) {
        setMessages(next);
        setError("No response received — try again.");
      }
    } catch (cause) {
      if ((cause as Error).name === "AbortError") return;
      setError("Something went wrong — try again.");
      setMessages(next);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  const bowtieSvg = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6l8 6-8 6V6zM20 6l-8 6 8 6V6z" fill="currentColor" opacity="0.9" />
    </svg>
  );

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          data-testid="richard-resume-launcher"
          aria-label="Open Richard operator chat"
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            right: "1.25rem",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "1px solid var(--ros-border-light)",
            background: "var(--ros-card-bg)",
            color: "var(--ros-text-muted)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {bowtieSvg}
        </button>
      )}

      {isOpen && (
        <div
          data-testid="richard-resume-panel"
          style={{
            position: "fixed",
            bottom: 0,
            right: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            width: "clamp(320px, 90vw, 400px)",
            maxHeight: "min(70vh, 580px)",
            margin: "0 0.75rem 0.75rem 0",
            borderRadius: "1rem",
            overflow: "hidden",
            background: "var(--ros-surface)",
            border: "1px solid var(--ros-border)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.625rem 0.875rem",
              borderBottom: "1px solid var(--ros-border-light)",
              background: "var(--ros-card-bg)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--ros-accent-cool)" }}>{bowtieSvg}</span>
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ros-text)" }}>
                  Richard Operator Chat
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--ros-text-dim)" }}>
                  Underwriting, risk, and portfolio systems
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              style={{
                borderRadius: 999,
                border: "1px solid var(--ros-pill-border)",
                background: "var(--ros-pill-bg)",
                color: "var(--ros-text-dim)",
                padding: "0.25rem 0.55rem",
                fontSize: "0.75rem",
              }}
            >
              Close
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0.875rem", display: "grid", gap: "0.75rem" }}>
            {messages.length === 0 && suggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    style={{
                      borderRadius: 999,
                      border: "1px solid var(--ros-border-light)",
                      background: "var(--ros-pill-bg)",
                      color: "var(--ros-text-muted)",
                      padding: "0.45rem 0.7rem",
                      fontSize: "0.75rem",
                      textAlign: "left",
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  alignSelf: message.role === "user" ? "end" : "stretch",
                  maxWidth: message.role === "user" ? "85%" : "100%",
                  borderRadius: "1rem",
                  padding: "0.75rem 0.85rem",
                  background: message.role === "user" ? "var(--ros-accent-cool)" : "var(--ros-pill-bg)",
                  border: message.role === "user" ? "none" : "1px solid var(--ros-border-light)",
                  color: message.role === "user" ? "#fff" : "var(--ros-text)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.65,
                  fontSize: "0.875rem",
                }}
              >
                {message.content}
              </div>
            ))}

            {error ? <div style={{ color: "var(--ros-accent-warm)", fontSize: "0.8rem" }}>{error}</div> : null}
            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              borderTop: "1px solid var(--ros-border-light)",
              padding: "0.75rem",
              background: "var(--ros-card-bg)",
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "var(--ros-text-dim)", marginBottom: "0.5rem" }}>
              Ask what Richard built, what improved, or how he controls credit risk at scale.
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask about Richard's systems..."
                style={{
                  flex: 1,
                  resize: "none",
                  borderRadius: "0.9rem",
                  border: "1px solid var(--ros-border-light)",
                  background: "var(--ros-pill-bg)",
                  color: "var(--ros-text)",
                  padding: "0.75rem 0.85rem",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => void sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                style={{
                  alignSelf: "stretch",
                  borderRadius: "0.9rem",
                  border: "1px solid var(--ros-border-light)",
                  background: input.trim() && !isStreaming ? "var(--ros-accent-cool)" : "var(--ros-pill-bg)",
                  color: input.trim() && !isStreaming ? "#fff" : "var(--ros-text-dim)",
                  padding: "0 1rem",
                  minWidth: 82,
                }}
              >
                {isStreaming ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
