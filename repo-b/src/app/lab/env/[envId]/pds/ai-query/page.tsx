"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/* ---------- types ---------- */

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChartConfig = {
  type: "line" | "bar" | "scatter" | "donut";
  data: Record<string, unknown>[];
  x?: string;
  y?: string;
  label?: string;
  values?: string;
  labels?: string;
  title?: string;
};

/* ---------- helpers ---------- */

const CHART_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

function parseCharts(text: string): { cleanText: string; charts: ChartConfig[] } {
  const charts: ChartConfig[] = [];
  const cleanText = text.replace(/<!--CHART_START-->([\s\S]*?)<!--CHART_END-->/g, (_, json) => {
    try {
      charts.push(JSON.parse(json));
    } catch { /* skip invalid */ }
    return "";
  });
  return { cleanText, charts };
}

const TOOLTIP_STYLE = { background: "#1f2937", border: "1px solid #374151", borderRadius: "6px" };
const PCT_FIELDS = /pct|percent|utilization|rate|compliance|margin|growth/i;

function fmtTooltipValue(value: unknown, name?: string): string {
  if (typeof value !== "number") return String(value ?? "");
  const isPct = name && PCT_FIELDS.test(name);
  const rounded = Number(value.toFixed(2));
  return isPct ? `${rounded}%` : rounded.toLocaleString("en-US");
}

function DynamicChart({ config }: { config: ChartConfig }) {
  const { type, data, x, y, label, values, labels, title } = config;

  if (!data || data.length === 0) return null;

  return (
    <div className="my-4 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
      {title && <h3 className="mb-3 text-sm font-medium text-zinc-300">{title}</h3>}
      <ResponsiveContainer width="100%" height={280}>
        {type === "line" && x && y ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={x} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, name: string) => fmtTooltipValue(v, name)} />
            <Line type="monotone" dataKey={y} stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 3 }} />
          </LineChart>
        ) : type === "bar" && x && y ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={x} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, name: string) => fmtTooltipValue(v, name)} />
            <Bar dataKey={y} fill="#3b82f6" />
          </BarChart>
        ) : type === "scatter" && x && y ? (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" dataKey={x} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis type="number" dataKey={y} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, name: string) => fmtTooltipValue(v, name)} />
            <Scatter data={data} fill="#3b82f6" />
          </ScatterChart>
        ) : type === "donut" && values && labels ? (
          <PieChart>
            <Pie data={data} dataKey={values} nameKey={labels} cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, name: string) => fmtTooltipValue(v, name)} />
          </PieChart>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 text-sm">Unsupported chart type</div>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- component ---------- */

export default function PdsAiQueryPage() {
  const { envId, businessId } = useDomainEnv();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bosFetch<{ suggestions: string[] }>("/api/pds/v2/chat/suggestions", {
      params: { env_id: envId, business_id: businessId ?? undefined },
    })
      .then((d) => setSuggestions(d.suggestions || []))
      .catch(() => {});
  }, [envId, businessId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !envId || isStreaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text.trim() };
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const chatMessages = [...messages.slice(-10), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(
        `/bos/api/pds/v2/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chatMessages,
            env_id: envId,
            business_id: businessId,
          }),
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          // Vercel AI SDK text format: 0:"text"
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: m.content + text } : m,
                ),
              );
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: `Error: ${errMsg}` } : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, [envId, businessId, messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex h-[calc(100vh-280px)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-zinc-100">AI Query</h1>
        <p className="text-sm text-zinc-400">Ask questions about your PDS data in natural language.</p>
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <p className="text-zinc-500 text-sm">Ask a question or pick a suggestion below</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const { cleanText, charts } = isUser ? { cleanText: msg.content, charts: [] } : parseCharts(msg.content);

          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                isUser
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-200 border border-zinc-700"
              }`}>
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: cleanText.replace(/\n/g, "<br/>") }}
                />
                {charts.map((chart, i) => (
                  <DynamicChart key={i} config={chart} />
                ))}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, utilization, NPS, accounts..."
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          disabled={isStreaming}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}
