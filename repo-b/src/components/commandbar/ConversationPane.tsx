"use client";

import { useCallback, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { CommandMessage, StructuredResultAction } from "@/lib/commandbar/store";
import StructuredResultCard from "@/components/commandbar/StructuredResultCard";

/**
 * Parse a markdown table string into chart data if the second+ columns are numeric.
 * Returns null if the table isn't chartable.
 */
function parseTableForChart(tableText: string): { data: Record<string, string | number>[]; keys: string[] } | null {
  const lines = tableText.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 3) return null;

  const parseRow = (line: string) =>
    line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);

  const header = parseRow(lines[0]);
  // lines[1] is the separator row (--- |)
  const dataRows = lines.slice(2).map(parseRow);
  if (header.length < 2 || dataRows.length === 0) return null;

  // Check if at least one data column is numeric
  const numericCols = header.slice(1).filter((_, i) =>
    dataRows.some((row) => {
      const val = row[i + 1]?.replace(/[%,$]/g, "").trim();
      return val !== undefined && !isNaN(parseFloat(val));
    })
  );
  if (numericCols.length === 0) return null;

  const data = dataRows.map((row) => {
    const entry: Record<string, string | number> = { label: row[0] || "" };
    header.slice(1).forEach((col, i) => {
      const raw = row[i + 1]?.replace(/[%,$]/g, "").trim() || "";
      const num = parseFloat(raw);
      entry[col] = isNaN(num) ? raw : num;
    });
    return entry;
  });

  return { data, keys: numericCols };
}

function ChartBlock({ tableText }: { tableText: string }) {
  const parsed = parseTableForChart(tableText);
  if (!parsed) return null;
  const { data, keys } = parsed;

  const COLORS = ["hsl(var(--bm-accent))", "#60a5fa", "#34d399", "#f59e0b", "#f87171"];

  return (
    <div className="mt-2 rounded-lg border border-bm-border/30 bg-bm-surface/20 p-3">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--bm-border)/0.3)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--bm-muted))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--bm-muted))" }} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--bm-surface))", border: "1px solid hsl(var(--bm-border)/0.5)", borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: "hsl(var(--bm-text))" }}
          />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function parseStatus(status?: string): { primary: string; meta?: string; lane?: string } {
  if (!status) return { primary: "Thinking" };
  // Parse "Processing (B): entity_name" format
  const match = status.match(/^Processing \(([A-D])\):\s*(.+)$/);
  if (match) return { primary: "Processing", meta: match[2], lane: match[1] };
  // Parse "Looking up list funds..." format
  if (status.startsWith("Looking up ")) return { primary: status, meta: undefined };
  return { primary: status };
}

const LANE_COLORS: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  B: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  C: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  D: "bg-red-500/20 text-red-300 border-red-500/30",
};

function ThinkingIndicator({ status, progress }: { status?: string; progress?: number }) {
  const { primary, meta, lane } = parseStatus(status);
  const showProgress = typeof progress === "number" && progress > 0 && progress < 1;

  return (
    <div className="flex items-start gap-3 animate-winston-fade-in">
      {/* Rotating thinking icon */}
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <svg
          className="h-4 w-4 animate-winston-spin text-bm-accent"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-0.5 pt-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-sm text-bm-muted animate-winston-glow">
            {primary}
          </span>
          {lane && (
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium ${LANE_COLORS[lane] || ""}`}>
              {lane}
            </span>
          )}
          {!showProgress && (
            <span className="inline-flex gap-0.5 ml-0.5">
              <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-1" />
              <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-2" />
              <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-3" />
            </span>
          )}
        </div>
        {showProgress && (
          <div className="w-full max-w-[200px] h-1 rounded-full bg-bm-border/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-bm-accent transition-all duration-300 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {meta && (
          <span className="text-[11px] text-bm-muted2 truncate max-w-[280px]">{meta}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Strip raw tool payloads and JSON blobs from the visible answer.
 * These get leaked when the model emits tool_call info as text content.
 */
function cleanAssistantContent(raw: string): string {
  let text = raw;
  // Remove leading JSON blocks like {"tool_name":"repe.list_funds","args":{...}}
  text = text.replace(/^\s*\{["']tool_name["'][\s\S]*?\}\s*/g, "");
  // Remove any {"resolved_scope":...} blocks that precede the answer
  text = text.replace(/^\s*\{["']resolved_scope["'][\s\S]*?\}\s*/g, "");
  // Remove stray `event: tool_call` / `data: {…}` SSE leaks
  text = text.replace(/^(event:\s*\w+\n?data:\s*\{[^}]*\}\n?)+/gm, "");
  return text.trim();
}

function formatAssistantContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length > 0) {
      const tableText = tableLines.join("\n");
      const key = `table-${elements.length}`;
      elements.push(
        <div key={key} className="my-2 space-y-1">
          <div className="overflow-x-auto">
            <pre className="whitespace-pre font-mono text-[12px] text-bm-text/90">{tableText}</pre>
          </div>
          <ChartBlock tableText={tableText} />
        </div>,
      );
      tableLines = [];
    }
    inTable = false;
  };

  for (const line of lines) {
    const isTableRow = /^\s*\|/.test(line) || /^[-|:]+$/.test(line.trim());
    if (isTableRow) {
      if (!inTable) inTable = true;
      tableLines.push(line);
    } else {
      if (inTable) flushTable();
      elements.push(
        <span key={`line-${elements.length}`}>
          {elements.length > 0 && !inTable ? "\n" : ""}
          {line}
        </span>,
      );
    }
  }
  if (inTable) flushTable();

  return <>{elements}</>;
}

function MessageBubble({
  message,
  onAction,
}: {
  message: CommandMessage;
  onAction?: (action: StructuredResultAction) => void;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Render structured result card if present
  if (message.structuredResult && !isUser) {
    const hasText = message.content.trim().length > 0;
    return (
      <div className="animate-winston-fade-in space-y-2">
        <StructuredResultCard result={message.structuredResult} onAction={onAction} />
        {hasText && (
          <div className="text-bm-text text-[13px] leading-relaxed whitespace-pre-wrap break-words font-sans">
            {formatAssistantContent(cleanAssistantContent(message.content))}
          </div>
        )}
      </div>
    );
  }

  const displayContent = isUser || isSystem ? message.content : cleanAssistantContent(message.content);

  return (
    <div className={`animate-winston-fade-in ${isUser ? "flex justify-end" : ""}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-bm-accent/15 text-bm-text"
            : isSystem
              ? "border border-bm-danger/20 bg-bm-danger/5 text-bm-danger"
              : "text-bm-text"
        }`}
      >
        {isUser || isSystem ? (
          <pre className="whitespace-pre-wrap break-words font-sans">{displayContent}</pre>
        ) : (
          <div className="whitespace-pre-wrap break-words font-sans">
            {formatAssistantContent(displayContent)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConversationPane({
  messages,
  thinking,
  thinkingStatus,
  thinkingProgress,
  onAction,
}: {
  contextKey?: string;
  messages: CommandMessage[];
  examples?: string[];
  recentRuns?: unknown[];
  thinking?: boolean;
  thinkingStatus?: string;
  thinkingProgress?: number;
  onAction?: (action: StructuredResultAction) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // If user is within 80px of the bottom, consider them "at bottom"
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, thinking]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--bm-border)/0.5) transparent" }}>
        {messages.length === 0 && !thinking ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-bm-border/40 bg-bm-surface/40">
              <svg className="h-5 w-5 text-bm-accent" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-sm text-bm-muted">Ask Winston anything about your portfolio.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onAction={onAction} />
            ))}
            {thinking && <ThinkingIndicator status={thinkingStatus} progress={thinkingProgress} />}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}
