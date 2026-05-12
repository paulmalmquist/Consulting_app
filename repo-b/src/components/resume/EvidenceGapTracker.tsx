import type { GapItem } from "./evidenceGraphData";

const STATUS_COLOR: Record<GapItem["status"], string> = {
  Planned: "var(--ros-text-muted)",
  "In Progress": "var(--ros-accent-warm)",
  Blocked: "var(--ros-text-dim)",
};

export function EvidenceGapTracker({ items }: { items: GapItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--ros-text-muted)" }}>
        No gaps tracked in the current view.
      </p>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--ros-border)" }}>
      {items.map((g) => (
        <li
          key={g.id}
          className="grid gap-x-6 gap-y-2 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] md:items-start"
          style={{ borderColor: "var(--ros-border)" }}
        >
          <div>
            <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--ros-text-bright)" }}>
              {g.capability}
            </p>
            <p className="mt-1 text-[11px] leading-[1.6]" style={{ color: "var(--ros-text-dim)" }}>
              {g.currentLevel}
            </p>
          </div>
          <div>
            <p className="text-[12px] leading-[1.6]" style={{ color: "var(--ros-text-muted)" }}>
              <span style={{ color: "var(--ros-accent-warm)" }}>Planned: </span>
              {g.plannedWinstonImpl}
            </p>
            <p className="mt-1 text-[11px] leading-[1.6]" style={{ color: "var(--ros-text-dim)" }}>
              Proof needed: {g.proofArtifactNeeded}
            </p>
          </div>
          <span
            className="self-start rounded border px-2 py-[3px] text-[9.5px] font-bold tracking-[0.16em] uppercase leading-none"
            style={{
              borderColor: STATUS_COLOR[g.status],
              color: STATUS_COLOR[g.status],
            }}
          >
            {g.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
