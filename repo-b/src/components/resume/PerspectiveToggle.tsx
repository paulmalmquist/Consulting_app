"use client";

import { usePerspective, type Perspective } from "./PerspectiveContext";

const OPTIONS: { value: Perspective; label: string }[] = [
  { value: "executive", label: "Executive" },
  { value: "engineer", label: "Engineer" },
  { value: "investor", label: "Investor" },
];

export default function PerspectiveToggle() {
  const { perspective, setPerspective } = usePerspective();

  return (
    <div className="inline-flex rounded-lg border border-bm-border/70 bg-bm-surface/30 p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setPerspective(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
            perspective === opt.value
              ? "bg-sky-500/20 text-sky-400"
              : "text-bm-muted2 hover:text-bm-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
