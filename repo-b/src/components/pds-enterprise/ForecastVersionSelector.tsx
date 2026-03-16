"use client";

const VERSIONS = [
  { label: "Original Budget", value: "budget" },
  { label: "3+9 Forecast", value: "forecast_3_9" },
  { label: "6+6 Forecast", value: "forecast_6_6" },
  { label: "9+3 Forecast", value: "forecast_9_3" },
  { label: "Annual Plan", value: "plan" },
] as const;

type Props = {
  selected: string[];
  onChange: (versions: string[]) => void;
};

export function ForecastVersionSelector({ selected, onChange }: Props) {
  const toggle = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400">Compare:</span>
      {VERSIONS.map((v) => (
        <button
          key={v.value}
          onClick={() => toggle(v.value)}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            selected.includes(v.value)
              ? "bg-blue-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
