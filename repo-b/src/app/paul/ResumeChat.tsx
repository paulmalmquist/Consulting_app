"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 20;

export default function ResumeChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load suggestions on first open
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cancel any in-flight request on unmount
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

    // Placeholder for assistant response
    setMessages([...next, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/resume/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, mode: "public_resume" }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") ?? "60";
        setError(`Too many requests — please wait ${retryAfter}s before trying again.`);
        setMessages(next); // remove empty placeholder
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
        // Parse Vercel AI SDK data stream format: lines like `0:"token"`
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("0:")) continue;
          try {
            const token: string = JSON.parse(trimmed.slice(2));
            assistantText += token;
            setMessages([...next, { role: "assistant", content: assistantText }]);
          } catch {
            // malformed line — skip
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

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          type="button"
          aria-label="Ask about Paul"
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "calc(1.5rem + env(safe-area-inset-bottom))",
            right: "1.5rem",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.125rem",
            borderRadius: "9999px",
            background: "var(--ros-accent-warm, #c84a2a)",
            color: "#fff",
            fontSize: "0.8125rem",
            fontWeight: 500,
            letterSpacing: "0.04em",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(200,74,42,0.35)",
            transition: "opacity 0.15s, transform 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Ask about Paul
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            right: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            // Desktop: floating panel; mobile: full-width bottom sheet
            width: "clamp(300px, 90vw, 380px)",
            maxHeight: "min(60vh, 520px)",
            margin: "0 1rem 1rem 0",
            borderRadius: "1rem",
            overflow: "hidden",
            background: "var(--ros-bg, #120d08)",
            border: "1px solid var(--ros-border, rgba(255,255,255,0.08))",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
          // Mobile: full-width bottom sheet
          className="resume-chat-panel"
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              borderBottom: "1px solid var(--ros-border, rgba(255,255,255,0.06))",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: "var(--ros-accent-warm, #c84a2a)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ros-text-muted, rgba(255,255,255,0.55))",
                }}
              >
                Paul&rsquo;s AI
              </span>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={handleClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ros-text-muted, rgba(255,255,255,0.45))",
                padding: "0.25rem",
                lineHeight: 1,
                borderRadius: "0.25rem",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ros-text, rgba(255,255,255,0.85))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ros-text-muted, rgba(255,255,255,0.45))"; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0.75rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {showSuggestions && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <p style={{ fontSize: "0.7rem", color: "var(--ros-text-dim, rgba(255,255,255,0.3))", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Try asking
                </p>
                {suggestions.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--ros-border, rgba(255,255,255,0.07))",
                      borderRadius: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.75rem",
                      color: "var(--ros-text-muted, rgba(255,255,255,0.55))",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.1s, color 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "var(--ros-text, rgba(255,255,255,0.85))"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--ros-text-muted, rgba(255,255,255,0.55))"; }}
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
                    maxWidth: "85%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: m.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
                    background: m.role === "user"
                      ? "var(--ros-accent-warm, #c84a2a)"
                      : "rgba(255,255,255,0.05)",
                    border: m.role === "user" ? "none" : "1px solid var(--ros-border, rgba(255,255,255,0.06))",
                    fontSize: "0.8125rem",
                    lineHeight: 1.55,
                    color: m.role === "user" ? "#fff" : "var(--ros-text, rgba(255,255,255,0.85))",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content || (isStreaming && i === messages.length - 1 ? (
                    <span style={{ opacity: 0.4, fontSize: "1rem" }}>▋</span>
                  ) : null)}
                </div>
              </div>
            ))}

            {error && (
              <p style={{ fontSize: "0.75rem", color: "rgba(220,80,60,0.9)", padding: "0.25rem 0" }}>
                {error}
              </p>
            )}

            {atCap && (
              <p style={{ fontSize: "0.72rem", color: "var(--ros-text-dim, rgba(255,255,255,0.3))", textAlign: "center", padding: "0.25rem 0" }}>
                Session limit reached — refresh to start a new conversation.
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {!atCap && (
            <div
              style={{
                padding: "0.625rem 0.75rem",
                paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))",
                borderTop: "1px solid var(--ros-border, rgba(255,255,255,0.06))",
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-end",
                flexShrink: 0,
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about Paul…"
                rows={1}
                inputMode="text"
                disabled={isStreaming}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--ros-border, rgba(255,255,255,0.08))",
                  borderRadius: "0.625rem",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.8125rem",
                  color: "var(--ros-text, rgba(255,255,255,0.85))",
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  minHeight: "2.25rem",
                  maxHeight: "6rem",
                  overflowY: "auto",
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
                  background: input.trim() && !isStreaming ? "var(--ros-accent-warm, #c84a2a)" : "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: "0.625rem",
                  width: "2.25rem",
                  height: "2.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && !isStreaming ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.15s",
                  color: "#fff",
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
          .resume-chat-panel {
            width: 100vw !important;
            max-height: 100dvh !important;
            margin: 0 !important;
            border-radius: 1rem 1rem 0 0 !important;
            right: 0 !important;
            bottom: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
