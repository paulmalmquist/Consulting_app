"use client";

// Morning Brief (Ticket 6) — compact, read-only daily operator panel above
// the task lanes. Derived from cro_execution_task at read time via
// GET /execution/morning-checklist. Suggested prompts are display-only;
// assistant retrieval is a later ticket.

import { useCallback, useEffect, useState } from "react";
import {
  fetchMorningChecklist,
  type MorningChecklist,
  type MorningChecklistItem,
  type MorningChecklistSection,
  type MorningChecklistSuggestedPrompt,
} from "@/lib/cro-api";

const TOP_PREVIEW = 3; // first N items shown when a section is collapsed

// Whether an items list looks like suggested prompts vs. task items.
function isPromptItem(
  it: MorningChecklistItem | MorningChecklistSuggestedPrompt,
): it is MorningChecklistSuggestedPrompt {
  return (it as MorningChecklistSuggestedPrompt).prompt !== undefined;
}

function crumb(it: MorningChecklistItem): string | null {
  if (!it.domain_label && !it.domain_key) return null;
  const dom = it.domain_label ?? it.domain_key;
  if (!it.initiative_label && !it.initiative_key) return dom ?? null;
  const ini = it.initiative_label ?? it.initiative_key;
  return `${dom} → ${ini}`;
}

export function MorningBriefPanel({
  envId,
  businessId,
}: {
  envId: string;
  businessId: string;
}) {
  const [data, setData] = useState<MorningChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(["top_priorities"]),
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchMorningChecklist(envId, businessId);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load brief");
    }
  }, [envId, businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSection = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Read-only error state. We never render fabricated content if the load fails.
  if (error) {
    return (
      <div style={errorStyle}>
        Morning Brief unavailable: {error}
        <button type="button" onClick={load} style={retryBtn}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={loadingStyle}>Loading Morning Brief…</div>
    );
  }

  const totalItems = data.summary.total_items;
  const overdueCount = data.summary.overdue_count;
  const blockedCount = data.summary.blocked_count;

  return (
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <div style={titleStyle}>
          <span style={titleLabelStyle}>Morning Brief</span>
          <span style={dateStyle}>{data.date}</span>
        </div>
        <div style={summaryRowStyle}>
          <SummaryChip label="items" value={totalItems} />
          <SummaryChip
            label="overdue"
            value={overdueCount}
            tone={overdueCount > 0 ? "warn" : "neutral"}
          />
          <SummaryChip
            label="blocked"
            value={blockedCount}
            tone={blockedCount > 0 ? "warn" : "neutral"}
          />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          style={collapseBtn}
          aria-label={collapsed ? "Expand Morning Brief" : "Collapse Morning Brief"}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed ? (
        <div style={sectionsWrapStyle}>
          {data.sections.map((section) => (
            <BriefSection
              key={section.key}
              section={section}
              expanded={expandedKeys.has(section.key)}
              onToggle={() => toggleSection(section.key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn";
}) {
  const color =
    tone === "warn" && value > 0 ? "#FCA5A5" : "rgba(220,230,240,0.72)";
  return (
    <span style={{ ...chipStyle, color }}>
      <span style={chipValueStyle}>{value}</span>
      <span style={chipLabelStyle}>{label}</span>
    </span>
  );
}

function BriefSection({
  section,
  expanded,
  onToggle,
}: {
  section: MorningChecklistSection;
  expanded: boolean;
  onToggle: () => void;
}) {
  const count = section.items.length;
  const empty = count === 0;
  // Show TOP_PREVIEW when collapsed; everything when expanded. Suggested
  // prompts always render fully (small list).
  const isPrompts = section.key === "suggested_prompts";
  const visible = expanded || isPrompts ? section.items : section.items.slice(0, TOP_PREVIEW);

  return (
    <div style={sectionStyle}>
      <button
        type="button"
        onClick={onToggle}
        style={sectionHeaderStyle}
        aria-expanded={expanded}
      >
        <span style={sectionLabelStyle}>{section.label}</span>
        <span style={sectionCountStyle}>{count}</span>
        {!isPrompts && count > TOP_PREVIEW ? (
          <span style={moreHintStyle}>
            {expanded ? "Show less" : `Show all ${count}`}
          </span>
        ) : null}
      </button>

      {empty ? (
        <div style={emptyStateStyle}>
          {emptyMessage(section.key)}
        </div>
      ) : (
        <ul style={listStyle}>
          {visible.map((it, idx) => (
            <li
              key={isPromptItem(it) ? it.key : it.task_id}
              style={itemStyle}
            >
              {isPromptItem(it) ? (
                <PromptRow prompt={it} />
              ) : (
                <TaskRow item={it as MorningChecklistItem} />
              )}
              {idx < visible.length - 1 ? <div style={dividerStyle} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ item }: { item: MorningChecklistItem }) {
  const c = crumb(item);
  return (
    <div style={taskRowStyle}>
      <div style={taskTopStyle}>
        <span style={reasonTagStyle}>{item.reason}</span>
        {item.due_date ? (
          <span style={metaTagStyle}>due {item.due_date}</span>
        ) : null}
        {item.impact ? (
          <span style={metaTagStyle}>impact {item.impact}</span>
        ) : null}
      </div>
      <div style={taskTitleStyle}>{item.title ?? "(no title)"}</div>
      {item.next_action ? (
        <div style={nextActionStyle}>→ {item.next_action}</div>
      ) : (
        <div style={emptyHintStyle}>No next action</div>
      )}
      {c ? <div style={crumbStyle}>{c}</div> : null}
    </div>
  );
}

function PromptRow({ prompt }: { prompt: MorningChecklistSuggestedPrompt }) {
  // Display-only — do NOT execute the prompt. (Assistant retrieval = Ticket 7.)
  return (
    <div style={promptRowStyle}>
      <span style={promptIconStyle}>?</span>
      <div>
        <div style={promptTextStyle}>{prompt.prompt}</div>
        <div style={promptReasonStyle}>{prompt.reason}</div>
      </div>
    </div>
  );
}

function emptyMessage(sectionKey: string): string {
  switch (sectionKey) {
    case "top_priorities":
      return "Nothing in Today. Add a task or accept a Generate suggestion.";
    case "overdue_follow_ups":
      return "No overdue items. Good.";
    case "web_properties":
      return "No Web Properties tasks queued.";
    case "outreach_crm":
      return "No Outreach / CRM tasks queued.";
    case "coding_platform":
      return "No Coding / Winston Platform tasks queued.";
    case "admin_ops":
      return "No Admin / Accounting reminders queued.";
    case "waiting_blocked":
      return "Nothing waiting or blocked.";
    case "suggested_prompts":
      return "No grounded prompts to suggest yet.";
    default:
      return "Nothing here.";
  }
}

// ── Styles (dark operator shell tokens, in line with ExecutionBoard) ────────

const containerStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(8,10,16,0.85)",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "8px 16px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
};

const titleLabelStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "rgba(220,230,240,0.85)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const dateStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(220,230,240,0.45)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flex: 1,
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  fontSize: 11,
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const chipValueStyle: React.CSSProperties = { fontWeight: 700 };
const chipLabelStyle: React.CSSProperties = {
  color: "rgba(220,230,240,0.5)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontSize: 10,
};

const collapseBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(220,230,240,0.66)",
  fontSize: 11,
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  letterSpacing: "0.04em",
  cursor: "pointer",
};

const sectionsWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 8,
  padding: "0 16px 12px",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.02)",
  borderRadius: 4,
  display: "flex",
  flexDirection: "column",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: 0,
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  color: "rgba(220,230,240,0.85)",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  flex: 1,
};

const sectionCountStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(220,230,240,0.55)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const moreHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "rgba(0,220,255,0.78)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: "4px 10px 8px",
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const itemStyle: React.CSSProperties = { padding: 0 };
const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.04)",
  margin: "4px 0",
};

const taskRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "4px 0",
};

const taskTopStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const reasonTagStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "1px 6px",
  borderRadius: 2,
  border: "1px solid rgba(0,220,255,0.30)",
  color: "rgba(0,220,255,0.92)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const metaTagStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(220,230,240,0.55)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const taskTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#dce6f0",
  lineHeight: 1.3,
};

const nextActionStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(0,220,255,0.85)",
  paddingLeft: 6,
  borderLeft: "2px solid rgba(0,220,255,0.35)",
  lineHeight: 1.3,
};

const emptyHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(220,230,240,0.40)",
  fontStyle: "italic",
};

const crumbStyle: React.CSSProperties = {
  fontSize: 9.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(167,139,250,0.78)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const emptyStateStyle: React.CSSProperties = {
  padding: "8px 10px 10px",
  fontSize: 11,
  color: "rgba(220,230,240,0.45)",
  fontStyle: "italic",
};

const promptRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "4px 0",
  alignItems: "flex-start",
};

const promptIconStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "rgba(167,139,250,0.12)",
  color: "rgba(167,139,250,0.95)",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
};

const promptTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#dce6f0",
  lineHeight: 1.3,
};

const promptReasonStyle: React.CSSProperties = {
  fontSize: 10,
  color: "rgba(220,230,240,0.45)",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const errorStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12,
  color: "#FCA5A5",
  background: "rgba(239,68,68,0.06)",
  borderBottom: "1px solid rgba(239,68,68,0.20)",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const retryBtn: React.CSSProperties = {
  marginLeft: "auto",
  padding: "3px 10px",
  borderRadius: 3,
  border: "1px solid rgba(239,68,68,0.40)",
  background: "transparent",
  color: "#FCA5A5",
  fontSize: 11,
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  cursor: "pointer",
};

const loadingStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12,
  color: "rgba(220,230,240,0.45)",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
};
