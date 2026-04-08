"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 30;

/**
 * Winston for the public resume — scoped to Paul's background via the resume
 * RAG endpoint. No auth required. Styled to match the Winston companion panel.
 */
export default function ResumeChat() {
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
    fetch("/api/resume/suggestions")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
      })
      .catch(() => {/* silently ignore */});
  }, [isOpen, suggestionsLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  function handleClose() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsOpen(false);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming) return;
    if (messages.length >= MAX_MESSAGES) return;

    setError(null);
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsStreaming(true);
    setMessages([...next, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/resume/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, mode: "public_resume", scope: "paul", user: "public" }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") ?? "60";
        setError(`Too many requests — please wait ${retryAfter}s.`);
        setMessages(next);
        setIsStreaming(false);
        return;
      }

      if (!res.ok || !res.body) {
        setError("Something went wrong — try again.");
        setMessages(next);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
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
            const token: string = JSON.parse(trimmed.slice(2));
            assistantText += token;
            setMessages([...next, { role: "assistant", content: assistantText }]);
          } catch {
            // malformed — skip
          }
        }
      }

      if (!assistantText) {
        setMessages(next);
        setError("No response received — try again.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError("Something went wrong — try again.");
      setMessages(next);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const atCap = messages.length >= MAX_MESSAGES;
  const showSuggestions = messages.length === 0 && suggestions.length > 0;

  // -- Winston bowtie icon (matches the real Winston launcher) --
  const bowtieSvg = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6l8 6-8 6V6zM20 6l-8 6 8 6V6z"
        fill="currentColor" opacity="0.9"
      />
    </svg>
  );

  return (
    <>
      {/* Launch button — styled like Winston companion */}
      {!isOpen && (
        <button
          type="button"
          aria-label="Open Winston"
          onClick={() => setIsOpen(true)}
          className="winston-resume-launcher"
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
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
        >
          {bowtieSvg}
        </button>
      )}

      {/* Chat panel — matches Winston companion styling */}
      {isOpen && (
        <div
          className="winston-resume-panel"
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
          {/* Header */}
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
              <span style={{ color: "var(--ros-accent-warm)" }}>{bowtieSvg}</span>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--ros-text)",
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                }}
              >
                Winston
              </span>
              <span
                style={{
                  fontSize: "0.625rem",
                  fontWeight: 500,
                  color: "var(--ros-text-dim)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--ros-pill-bg)",
                  border: "1px solid var(--ros-pill-border)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Resume
              </span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={handleClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ros-text-dim)",
                padding: "0.25rem",
                lineHeight: 1,
                borderRadius: 4,
                transition: "color 0.1s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0.75rem 0.875rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
            }}
          >
            {showSuggestions && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <p style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "var(--ros-text-dim)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.25rem",
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                }}>
                  Try asking
                </p>
                {suggestions.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    style={{
                      background: "var(--ros-pill-bg)",
                      border: "1px solid var(--ros-border-light)",
                      borderRadius: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.8125rem",
                      color: "var(--ros-text-muted)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.1s, color 0.1s, border-color 0.1s",
                      fontFamily: "var(--font-body, system-ui, sans-serif)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "88%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: m.role === "user" ? "0.75rem 0.75rem 0.25rem 0.75rem" : "0.75rem 0.75rem 0.75rem 0.25rem",
                    background: m.role === "user"
                      ? "var(--ros-accent-cool)"
                      : "var(--ros-pill-bg)",
                    border: m.role === "user" ? "none" : "1px solid var(--ros-border-light)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                    color: m.role === "user" ? "#fff" : "var(--ros-text)",
                    whiteSpace: "pre-wrap",
                    fontFamily: "var(--font-body, system-ui, sans-serif)",
                  }}
                >
                  {m.content || (isStreaming && i === messages.length - 1 ? (
                    <span style={{ opacity: 0.4, fontSize: "1rem" }}>▋</span>
                  ) : null)}
                </div>
              </div>
            ))}

            {error && (
              <p style={{
                fontSize: "0.8125rem",
                color: "var(--ros-accent-warm)",
                padding: "0.25rem 0",
                fontFamily: "var(--font-body, system-ui, sans-serif)",
              }}>
                {error}
              </p>
            )}

            {atCap && (
              <p style={{
                fontSize: "0.75rem",
                color: "var(--ros-text-dim)",
                textAlign: "center",
                padding: "0.25rem 0",
              }}>
                Session limit reached — refresh to start a new conversation.
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {!atCap && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
                borderTop: "1px solid var(--ros-border-light)",
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-end",
                flexShrink: 0,
                background: "var(--ros-card-bg)",
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about Paul's background…"
                rows={1}
                inputMode="text"
                disabled={isStreaming}
                style={{
                  flex: 1,
                  background: "var(--ros-pill-bg)",
                  border: "1px solid var(--ros-border-light)",
                  borderRadius: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.8125rem",
                  color: "var(--ros-text)",
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  minHeight: "2.25rem",
                  maxHeight: "6rem",
                  overflowY: "auto",
                  fontFamily: "var(--font-body, system-ui, sans-serif)",
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
                }}
              />
              <button
                type="button"
                disabled={!input.trim() || isStreaming}
                onClick={() => void sendMessage(input)}
                aria-label="Send"
                style={{
                  background: input.trim() && !isStreaming ? "var(--ros-accent-cool)" : "var(--ros-pill-bg)",
                  border: "1px solid var(--ros-border-light)",
                  borderRadius: "0.5rem",
                  width: "2.25rem",
                  height: "2.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && !isStreaming ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.15s",
                  color: input.trim() && !isStreaming ? "#fff" : "var(--ros-text-dim)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 639px) {
          .winston-resume-panel {
            width: 100vw !important;
            max-height: 85dvh !important;
            margin: 0 !important;
            border-radius: 1rem 1rem 0 0 !important;
          }
        }
        .winston-resume-launcher:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 28px rgba(0,0,0,0.35);
        }
      `}</style>
    </>
  );
}
