export function RollupToggleBar({ value, onChange }: { value: "account" | "market"; onChange: (next: "account" | "market") => void }) {
  return (
    <div className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/15 p-1">
      {(["account", "market"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
            value === item ? "bg-pds-accent/15 text-pds-accentText" : "text-bm-muted2"
          }`}
        >
          By {item}
        </button>
      ))}
    </div>
  );
}
