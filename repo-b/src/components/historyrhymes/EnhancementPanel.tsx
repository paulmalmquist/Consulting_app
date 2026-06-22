"use client";

import React from "react";

export function EnhancementPanel({ enhancements }: { enhancements: string[] }) {
  return (
    <section
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
      data-testid="hr-enhancement-panel"
    >
      <h2 className="text-sm font-semibold text-neutral-100 mb-2">
        Top new enhancements
      </h2>
      {enhancements.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No new enhancements vs previous brief.
        </p>
      ) : (
        <ul className="space-y-1">
          {enhancements.map((e, i) => (
            <li key={i} className="text-sm text-neutral-300 flex gap-2">
              <span className="text-sky-500/70">·</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
