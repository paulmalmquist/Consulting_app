"use client";

/**
 * SqlAgentPanel — Databricks Genie-style query interface.
 *
 * User asks a business question, system shows:
 *   - answer summary
 *   - generated SQL (toggle / inspectable)
 *   - filters applied
 *   - table result
 *   - chart if appropriate
 *   - follow-up suggestions
 */

import React, { useCallback, useRef, useState } from "react";
import { sqlAgentQuery, type SqlAgentQueryResult } from "@/lib/sql-agent-api";
import ChatChartBlock from "@/components/winston/blocks/ChatChartBlock";
import ChatTableBlock from "@/components/winston/blocks/ChatTableBlock";

type Props = {
  businessId: string;
  envId?: string;
  quarter?: string;
  tenantId?: string;
};

type HistoryEntry = {
  id: string;
  question: string;
  result: SqlAgentQueryResult;
  timestamp: number;
};

export default function SqlAgentPanel({ businessId, envId, quarter, tenantId }: Props) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (q?: string) => {
      const query = q ?? question.trim();
      if (!query) return;

      setLoading(true);
      setQuestion("");

      try {
        const result = await sqlAgentQuery({
          question: query,
          business_id: businessId,
          env_id: envId,
          quarter,
          tenant_id: tenantId,
        });

        setHistory((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            question: query,
            result,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      } catch (err) {
        setHistory((prev) => [
          {
            id: `${Date.now()}-err`,
            question: query,
            result: {
              query_type: "unknown",
              domain: "unknown",
              confidence: 0,
              sql: null,
              sql_params: {},
              sql_source: "none",
              template_key: null,
              validation: null,
              columns: [],
              rows: [],
              row_count: 0,
              truncated: false,
              execution_time_ms: 0,
              chart: null,
              chart_alternatives: [],
              answer_summary: null,
              follow_up_suggestions: [],
              total_time_ms: 0,
              error: err instanceof Error ? err.message : "Request failed",
              warnings: [],
            },
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [question, businessId, envId, quarter, tenantId],
  );

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      {/* Input bar */}
      <div className="shrink-0 border-b border-[var(--bm-border)] px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your data..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm rounded border border-[var(--bm-border)] bg-transparent text-[var(--bm-text)] placeholder:text-[var(--bm-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--bm-text)]/20 disabled:opacity-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2 text-xs font-medium uppercase tracking-wider rounded border border-[var(--bm-border)] text-[var(--bm-text)] hover:bg-[var(--bm-surface)]/10 disabled:opacity-30 transition-colors"
          >
            {loading ? "Running..." : "Query"}
          </button>
        </form>

        {/* Quick templates */}
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => handleSubmit(p)}
              disabled={loading}
              className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border border-[var(--bm-border)]/50 text-[var(--bm-muted)] hover:text-[var(--bm-text)] hover:border-[var(--bm-border)] transition-colors disabled:opacity-30"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {history.length === 0 && !loading && <EmptyState />}
        {loading && <LoadingIndicator />}
        {history.map((entry) => (
          <ResultCard key={entry.id} entry={entry} onFollowUp={handleSubmit} />
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center">
      <p className="text-[var(--bm-muted)] text-sm">
        Ask a business question to query your data
      </p>
      <p className="text-[var(--bm-muted)]/60 text-xs mt-1">
        e.g. &quot;top 10 assets by NOI&quot; or &quot;utilization trend by quarter&quot;
      </p>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="h-1.5 w-1.5 rounded-full bg-[var(--bm-muted)] animate-pulse" />
      <span className="text-xs text-[var(--bm-muted)] uppercase tracking-wider">
        Generating query...
      </span>
    </div>
  );
}

function ResultCard({
  entry,
  onFollowUp,
}: {
  entry: HistoryEntry;
  onFollowUp: (q: string) => void;
}) {
  const { question, result } = entry;
  const [showSql, setShowSql] = useState(false);

  return (
    <div className="border border-[var(--bm-border)]/50 rounded-md overflow-hidden">
      {/* Question header */}
      <div className="px-3 py-2 bg-[var(--bm-surface)]/5 border-b border-[var(--bm-border)]/30">
        <p className="text-xs text-[var(--bm-text)] font-medium">{question}</p>
        <div className="flex gap-2 mt-1">
          <Badge label={result.domain} />
          <Badge label={result.query_type} />
          <Badge label={result.sql_source} />
          {result.total_time_ms > 0 && (
            <span className="text-[10px] text-[var(--bm-muted)]">
              {result.total_time_ms.toFixed(0)}ms
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {result.error && (
        <div className="px-3 py-2 text-xs text-[var(--bm-danger)] bg-[var(--bm-danger)]/5">
          {result.error}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--bm-warning)] bg-[var(--bm-warning)]/5">
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Answer summary */}
      {result.answer_summary && !result.error && (
        <div className="px-3 py-2 text-xs text-[var(--bm-text)]">
          {result.answer_summary}
        </div>
      )}

      {/* Chart */}
      {result.chart && !result.error && (
        <div className="px-3 py-2 border-t border-[var(--bm-border)]/20">
          <ChatChartBlock
            block={{
              type: "chart",
              block_id: `chart-${entry.id}`,
              chart_type: result.chart.chart_type,
              title: "",
              x_key: result.chart.x_key,
              y_keys: result.chart.y_keys,
              data: result.chart.data,
              format: result.chart.format,
              series_key: result.chart.series_key,
            }}
          />
        </div>
      )}

      {/* Table */}
      {result.columns.length > 0 && result.rows.length > 0 && !result.error && (
        <div className="px-3 py-2 border-t border-[var(--bm-border)]/20">
          <ChatTableBlock
            block={{
              type: "table",
              block_id: `table-${entry.id}`,
              columns: result.columns,
              rows: result.rows,
              ranked: result.query_type === "ranked_comparison",
              export_name: `sql-agent-${result.domain}`,
            }}
          />
          {result.truncated && (
            <p className="text-[10px] text-[var(--bm-muted)] mt-1">
              Showing {result.row_count} rows (results truncated)
            </p>
          )}
        </div>
      )}

      {/* SQL inspector */}
      {result.sql && (
        <div className="border-t border-[var(--bm-border)]/20">
          <button
            onClick={() => setShowSql((s) => !s)}
            className="w-full px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--bm-muted)] hover:text-[var(--bm-text)] text-left transition-colors"
          >
            {showSql ? "Hide SQL" : "Show SQL"}{" "}
            {result.template_key && (
              <span className="ml-1 text-[var(--bm-muted)]/60">
                (template: {result.template_key})
              </span>
            )}
          </button>
          {showSql && (
            <pre className="px-3 pb-2 text-[10px] text-[var(--bm-muted)] overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
              {result.sql}
            </pre>
          )}
        </div>
      )}

      {/* Follow-up suggestions */}
      {result.follow_up_suggestions.length > 0 && !result.error && (
        <div className="px-3 py-2 border-t border-[var(--bm-border)]/20 flex gap-1.5 flex-wrap">
          {result.follow_up_suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onFollowUp(s)}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--bm-border)]/40 text-[var(--bm-muted)] hover:text-[var(--bm-text)] hover:border-[var(--bm-border)] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-widest rounded bg-[var(--bm-surface)]/10 text-[var(--bm-muted)] border border-[var(--bm-border)]/30">
      {label}
    </span>
  );
}

// ── Quick prompts ───────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Top 10 assets by NOI",
  "Fund returns this quarter",
  "Occupancy trend",
  "Stale opportunities",
  "Utilization by region",
  "Revenue vs budget",
];
