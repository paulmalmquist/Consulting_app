"use client";

type Props = {
  value: "all" | "variable" | "dedicated";
  onChange: (v: "all" | "variable" | "dedicated") => void;
};

const OPTIONS: { label: string; value: Props["value"] }[] = [
  { label: "All", value: "all" },
  { label: "Variable", value: "variable" },
  { label: "Dedicated", value: "dedicated" },
];

export function GovernanceTrackToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border border-zinc-700 text-sm">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 transition-colors ${
            value === opt.value
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:bg-zinc-800"
          } ${opt.value === "all" ? "rounded-l-md" : ""} ${
            opt.value === "dedicated" ? "rounded-r-md" : ""
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
