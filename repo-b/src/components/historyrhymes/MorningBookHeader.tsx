"use client";

import React from "react";
import type { TriageState } from "@/lib/historyrhymes/client";
import { TriageBadge } from "./TriageBadge";

interface Props {
  envId: string;
  currentRegime: string | null;
  triage: TriageState;
}

export function MorningBookHeader({ envId, currentRegime, triage }: Props) {
  return (
    <header
      className="flex items-start justify-between gap-3"
      data-testid="hr-morning-book-header"
    >
      <div>
        <h1 className="text-lg font-semibold text-neutral-100">
          History Rhymes — Morning Book
        </h1>
        <p className="text-xs text-neutral-500">
          env: {envId} · what materially changed since the last regime assessment
        </p>
        <p className="mt-2 text-sm text-neutral-300">
          <span className="text-neutral-500 uppercase tracking-wider text-[10px]">
            Current regime
          </span>
          <br />
          <span className="text-base font-semibold text-neutral-100">
            {currentRegime ?? "—"}
          </span>
        </p>
      </div>
      <TriageBadge triage={triage} />
    </header>
  );
}
