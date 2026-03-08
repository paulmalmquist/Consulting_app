"use client";

type ActiveContextBarProps = {
  workspace: {
    env: string;
    business: string;
    route: string;
    fundId?: string;
    assetId?: string;
    context?: string;
    [key: string]: string | undefined;
  };
  resolvedScope?: {
    resolved_scope_type?: string;
    entity_type?: string;
    entity_name?: string;
    environment_id?: string;
  } | null;
  quarter?: string;
};

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-bm-surface/50 border border-bm-border/30 px-2 py-0.5">
      <span className="text-[9px] text-bm-muted2 uppercase tracking-wider">{label}</span>
      <span className="text-[11px] text-bm-text font-medium truncate max-w-[160px]">{value}</span>
    </span>
  );
}

export default function ActiveContextBar({ workspace, resolvedScope, quarter }: ActiveContextBarProps) {
  const chips: { label: string; value: string }[] = [];

  // Environment
  if (workspace.env && workspace.env !== "none") {
    chips.push({ label: "Env", value: workspace.env });
  }

  // Entity (fund, asset, investment)
  if (resolvedScope?.entity_name) {
    const typeLabel = resolvedScope.entity_type || "Entity";
    chips.push({ label: typeLabel, value: resolvedScope.entity_name });
  } else if (workspace.context === "fund" && workspace.fundId) {
    chips.push({ label: "Fund", value: workspace.fundId.slice(0, 8) });
  } else if (workspace.context === "asset" && workspace.assetId) {
    chips.push({ label: "Asset", value: workspace.assetId.slice(0, 8) });
  }

  // Quarter
  if (quarter) {
    chips.push({ label: "Qtr", value: quarter });
  }

  if (!chips.length) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-bm-border/30 bg-bm-surface/10">
      <span className="text-[9px] text-bm-muted2 uppercase tracking-wider mr-1">Context</span>
      {chips.map((chip, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-bm-muted2 text-[10px]">&rsaquo;</span>}
          <ContextChip label={chip.label} value={chip.value} />
        </span>
      ))}
    </div>
  );
}
