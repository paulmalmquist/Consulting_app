export type PdsGrain = "portfolio" | "account" | "project" | "issue";

const OPTIONS: PdsGrain[] = ["portfolio", "account", "project", "issue"];

export function GrainToggleBar({
  value,
  onChange,
}: {
  value: PdsGrain;
  onChange: (next: PdsGrain) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/15 p-1">
      {OPTIONS.map((grain) => (
        <button
          key={grain}
          type="button"
          onClick={() => onChange(grain)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
            value === grain ? "bg-pds-accent/15 text-pds-accentText" : "text-bm-muted2"
          }`}
          aria-pressed={value === grain}
        >
          {grain}
        </button>
      ))}
    </div>
  );
}
