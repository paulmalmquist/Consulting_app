"use client";

// Agent pills (PR 13; extracted in PR 14 for reuse on the Mission Control wall).
// Deterministic role lenses: click a pill to filter the feed to that agent's cards; the
// count is the agent's cards already in the feed. Disabled (no handler) until an env+tenant
// resolves. Pure presentational — no run logic here (run-now lives in the home header).
import type { AgentType } from "@/lib/intelligence/cards";

// Action teal kept local so this component carries no cross-file constant dependency.
const ACTION_TEAL = "92, 213, 204";

export const AGENT_PILLS = [
  { type: "cfo", label: "CFO", glow: ACTION_TEAL },
  { type: "operations", label: "Operations", glow: "107, 174, 127" },
  { type: "data_quality", label: "Data Quality", glow: "176, 64, 255" },
  { type: "risk", label: "Risk", glow: "209, 161, 91" },
] as const satisfies ReadonlyArray<{ type: AgentType; label: string; glow: string }>;

// The agent types in display order — for deriving per-agent counts from card.created_by.
export const AGENT_PILL_TYPES: AgentType[] = AGENT_PILLS.map((a) => a.type);

export function AgentPills({
  activeFilter,
  counts,
  onToggle,
}: {
  activeFilter: AgentType | null;
  counts: Record<AgentType, number>;
  onToggle: ((agent: AgentType) => void) | null; // null => disabled (no env/tenant)
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Agents">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
        Agents
      </span>
      {AGENT_PILLS.map((agent) => {
        const active = activeFilter === agent.type;
        const count = counts[agent.type] ?? 0;
        const disabled = !onToggle;
        return (
          <button
            key={agent.type}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={disabled ? "Select an environment to run agents" : `Filter the feed to ${agent.label} cards`}
            onClick={() => onToggle?.(agent.type)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:cursor-default disabled:opacity-50"
            style={{
              borderColor: `rgba(${agent.glow}, ${active ? 0.55 : 0.22})`,
              background: `rgba(${agent.glow}, ${active ? 0.16 : 0.06})`,
              color: active ? "#fff" : "rgba(255,255,255,0.55)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgba(${agent.glow}, 0.8)` }} />
            {agent.label}
            {count > 0 ? <span className="text-white/70">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
