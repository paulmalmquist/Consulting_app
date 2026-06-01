"use client";

import { useEffect, useState } from "react";
import {
  getRuns, type TestRun, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { Card, Loading, ErrorState, PublicDataFooter } from "./primitives";

export default function RunsExplorer() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRuns(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then(setRuns)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!runs) return <Loading label="Loading test runs…" />;
  if (runs.length === 0)
    return <Card className="text-sm text-bm-muted">No test runs ingested yet.</Card>;

  return (
    <div className="space-y-6">
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/60 text-left text-[11px] uppercase tracking-wider text-bm-muted2">
              <th className="pb-2">Run</th><th className="pb-2">Dataset</th>
              <th className="pb-2">Unit / Channel</th><th className="pb-2">Rows</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-bm-border/30">
                <td className="py-2 font-mono text-[12px] text-bm-text">{r.run_key}</td>
                <td className="text-bm-muted">{r.dataset}</td>
                <td className="text-bm-muted">
                  {r.unit_or_channel}{r.spacecraft ? ` · ${r.spacecraft}` : ""}
                </td>
                <td className="tabular-nums text-bm-muted">{r.row_count.toLocaleString()}</td>
                <td>
                  <span className="rounded-full border border-bm-border/60 bg-bm-surface/40 px-2 py-0.5 text-[11px] text-bm-muted">
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="text-[11px] leading-relaxed text-bm-muted2">
        Runs are served from the Supabase serving layer (tel_test_runs). The D-4 run is the one the
        Replay page animates with real champion scores.
      </Card>
      <PublicDataFooter />
    </div>
  );
}
