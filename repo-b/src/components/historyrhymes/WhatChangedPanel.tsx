"use client";

import React from "react";

/**
 * Renders the what_changed bullets EXACTLY as returned by the backend.
 * The order is a frozen contract — never reorder, never sort.
 */
export function WhatChangedPanel({ items }: { items: string[] }) {
  return (
    <section
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
      data-testid="hr-what-changed"
    >
      <h2 className="text-sm font-semibold text-neutral-100 mb-2">What changed</h2>
      <ul className="space-y-1">
        {items.map((line, i) => (
          <li key={i} className="text-sm text-neutral-300 flex gap-2">
            <span className="text-neutral-600">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
