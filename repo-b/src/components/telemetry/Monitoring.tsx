"use client";

import { useEffect, useState } from "react";
import {
  getMonitoring, type MonitoringResponse,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { Card, Kpi, Loading, ErrorState, Unavailable, MetaRow, PublicDataFooter } from "./primitives";

export default function Monitoring() {
  const [mon, setMon] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonitoring(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then(setMon)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!mon) return <Loading label="Loading monitoring…" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Predictions logged" value={String(mon.prediction_count)} />
        <Kpi label="Rolling no-go rate"
             value={mon.rolling_anomaly_rate != null ? `${(mon.rolling_anomaly_rate * 100).toFixed(1)}%` : "—"} />
        <Kpi label="PSI (drift)" value={mon.psi != null ? mon.psi.toFixed(3) : "—"}
             sub={mon.psi == null ? "not computed yet" : undefined} />
        <Kpi label="Serving model"
             value={mon.latest_model_version ? `v${mon.latest_model_version}` : "—"}
             sub={mon.latest_model_name ?? undefined} />
      </div>

      <Card className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-bm-muted2">
          Serving state
        </p>
        <MetaRow label="Champion currently serving"
                 value={mon.latest_model_name ? `${mon.latest_model_name} (${mon.latest_model_alias ?? "—"})` : "—"} />
        <MetaRow label="Last scored at" value={mon.last_scored_at ?? "never"} />
        <MetaRow label="Window" value={mon.window_label} />
        {mon.null_reason ? (
          <Unavailable reason={mon.null_reason} />
        ) : null}
      </Card>

      <Card className="text-[11px] leading-relaxed text-bm-muted2">
        Aggregated from the Supabase prediction log (tel_predictions). PSI/drift shows a dash until a
        drift job populates tel_drift_metrics — surfaced honestly as not-yet-computed rather than a
        fabricated zero. This panel is the tell that the system is operated after deployment, not
        trained once.
      </Card>
      <PublicDataFooter />
    </div>
  );
}
