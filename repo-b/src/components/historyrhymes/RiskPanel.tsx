"use client";

import React from "react";

export function RiskPanel({ risks }: { risks: string[] }) {
  return (
    <section
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
      data-testid="hr-risk-panel"
    >
      <h2 className="text-sm font-semibold text-neutral-100 mb-2">Top risks</h2>
      {risks.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No flagged risks vs previous brief.
        </p>
      ) : (
        <ul className="space-y-1">
          {risks.map((r, i) => (
            <li key={i} className="text-sm text-neutral-300 flex gap-2">
              <span className="text-red-500/70">·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
