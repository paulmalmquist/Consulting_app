"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchMorningBook,
  type MorningBookData,
} from "@/lib/historyrhymes/client";
import { MorningBookHeader } from "./MorningBookHeader";
import { WhatChangedPanel } from "./WhatChangedPanel";
import { ConfidenceFreshnessStrip } from "./ConfidenceFreshnessStrip";
import { RiskPanel } from "./RiskPanel";
import { EnhancementPanel } from "./EnhancementPanel";

interface Props {
  envId: string;
}

export function MorningBookClient({ envId }: Props) {
  const [data, setData] = useState<MorningBookData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setData(await fetchMorningBook());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-200 p-6"
      data-testid="hr-morning-book-page"
    >
      <div className="max-w-2xl mx-auto space-y-4">
        {loading && (
          <div className="text-xs text-neutral-500">Loading Morning Book…</div>
        )}

        {!loading && !data && (
          <div className="text-xs text-red-400">
            Morning Book unavailable. Check the backend connection.
          </div>
        )}

        {!loading && data && (
          <>
            <MorningBookHeader
              envId={envId}
              currentRegime={data.current_regime}
              triage={data.triage}
            />

            {data.warnings.length > 0 && (
              <div
                className="text-xs rounded border border-amber-700 bg-amber-900/20 text-amber-300 p-2"
                data-testid="hr-morning-book-warnings"
              >
                <ul className="list-disc list-inside">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <WhatChangedPanel items={data.what_changed} />
            <ConfidenceFreshnessStrip
              confidence={data.confidence}
              freshness={data.freshness}
            />
            <RiskPanel risks={data.top_risks} />
            <EnhancementPanel enhancements={data.top_new_enhancements} />

            <div className="pt-1">
              <button
                type="button"
                onClick={() => void refresh()}
                className="text-xs px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
              >
                Refresh
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
