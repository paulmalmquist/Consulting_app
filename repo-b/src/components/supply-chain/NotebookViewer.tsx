"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import type { Notebook, NotebookHighlight } from "@/lib/supply-chain/notebooks";

const COLLAPSE_LINES = 28;

interface Props {
  notebook: Notebook;
  defaultExpanded?: boolean;
  jumpToSection?: string; // highlight label to auto-scroll to
}

// ---------------------------------------------------------------------------
// Basic token colorizer — no external deps
// ---------------------------------------------------------------------------
function tokenize(line: string): string {
  // Order matters: comments first so keywords inside comments stay gray
  if (/^\s*#/.test(line)) {
    return `<span class="sc-comment">${esc(line)}</span>`;
  }
  if (/^\s*--/.test(line)) {
    return `<span class="sc-comment">${esc(line)}</span>`;
  }

  const PY_KW =
    /\b(def|class|import|from|as|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|try|except|raise|with|lambda|pass|break|continue|yield|async|await|global|nonlocal|del|assert)\b/g;
  const SQL_KW =
    /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|HAVING|LIMIT|WITH|AS|ON|AND|OR|NOT|NULL|IS|IN|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|CREATE|VIEW|TABLE|INSERT|UPDATE|DELETE|CAST|COALESCE|DISTINCT|COUNT|SUM|AVG|MIN|MAX|ROUND|DATE_TRUNC|ADD_MONTHS|CURRENT_DATE|NULLIF|OVER|PARTITION BY|LAG|STDDEV|PERCENTILE_APPROX|DECIMAL|BY|REPLACE|OR|COMMENT|SHOW|VIEWS|IN)\b/g;
  const STRING = /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/g;
  const FSTRING = /\b(f|r|b|u)?(?=["'])/g;
  const DECORATOR = /^(\s*@[\w.]+)/;

  let out = esc(line);

  // strings first (protect them from keyword coloring)
  out = out.replace(STRING, '<span class="sc-string">$1</span>');

  // decorators
  out = out.replace(DECORATOR, '<span class="sc-decorator">$1</span>');

  // SQL keywords (uppercase)
  out = out.replace(SQL_KW, '<span class="sc-keyword">$&</span>');

  // Python keywords
  out = out.replace(PY_KW, '<span class="sc-keyword">$&</span>');

  return out;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotebookViewer({ notebook, defaultExpanded = false, jumpToSection }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/supply-chain-notebooks/${notebook.filename}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      })
      .then(setCode)
      .catch((e) => setError(String(e)));
  }, [notebook.filename]);

  // Scroll to highlighted section after code loads
  useEffect(() => {
    if (code && jumpToSection && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [code, jumpToSection]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const lines = code?.split("\n") ?? [];
  const totalLines = lines.length;
  const shouldCollapse = !expanded && totalLines > COLLAPSE_LINES;
  const visibleLines = shouldCollapse ? lines.slice(0, COLLAPSE_LINES) : lines;

  // Find highlight line range for the requested section
  const activeHighlight: NotebookHighlight | undefined = jumpToSection
    ? notebook.highlights.find((h) => h.label === jumpToSection)
    : undefined;

  const isHighlightedLine = (lineIdx: number): boolean => {
    if (!activeHighlight) return false;
    const ln = lineIdx + 1; // 1-indexed
    return ln >= activeHighlight.lineStart && ln <= activeHighlight.lineEnd;
  };

  return (
    <div className="rounded-lg border border-[--bm-border] overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[--bm-surface-2] border-b border-[--bm-border]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${notebook.layerColor}`}
          >
            {notebook.layer}
          </span>
          <code className="text-bm-text font-mono text-xs truncate">{notebook.filename}</code>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 shrink-0 rounded px-2 py-1 text-xs text-bm-muted hover:text-bm-text hover:bg-[--bm-surface] transition-colors"
          aria-label="Copy notebook code"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {/* Code area */}
      <div className="bg-[--bm-surface-2] overflow-x-auto">
        {error ? (
          <p className="px-4 py-6 text-rose-500 font-mono text-xs">{error}</p>
        ) : !code ? (
          <p className="px-4 py-6 text-bm-muted text-xs animate-pulse">Loading…</p>
        ) : (
          <>
            {/* Highlight jump anchor */}
            {activeHighlight && (
              <div ref={highlightRef} className="sr-only" />
            )}
            <pre className="font-mono text-xs leading-[1.65] py-3 select-text">
              {visibleLines.map((line, i) => {
                const highlighted = isHighlightedLine(i);
                return (
                  <div
                    key={i}
                    className={highlighted ? "bg-amber-400/10 border-l-2 border-amber-400" : ""}
                  >
                    <span
                      className="select-none text-bm-muted2 pr-4 pl-3 text-right inline-block"
                      style={{ minWidth: "3rem", userSelect: "none" }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="pr-6 sc-code"
                      dangerouslySetInnerHTML={{ __html: tokenize(line) }}
                    />
                  </div>
                );
              })}
              {shouldCollapse && (
                <div className="px-3 py-1 text-bm-muted2 italic">
                  … {totalLines - COLLAPSE_LINES} more lines
                </div>
              )}
            </pre>
          </>
        )}
      </div>

      {/* Expand / Collapse footer */}
      {code && totalLines > COLLAPSE_LINES && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-bm-muted hover:text-bm-text bg-[--bm-surface-2] border-t border-[--bm-border] transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={13} />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown size={13} />
              Show all {totalLines} lines
            </>
          )}
        </button>
      )}

      {/* Token coloring styles — scoped to this component */}
      <style>{`
        .sc-comment   { color: #6b7280; font-style: italic; }
        .sc-keyword   { color: #60a5fa; }
        .sc-string    { color: #f59e0b; }
        .sc-decorator { color: #a78bfa; }
        .sc-code      { white-space: pre; }
        @media (prefers-color-scheme: light) {
          .sc-comment  { color: #9ca3af; }
          .sc-keyword  { color: #2563eb; }
          .sc-string   { color: #d97706; }
          .sc-decorator{ color: #7c3aed; }
        }
      `}</style>
    </div>
  );
}
