"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getModelPerformance, getMonitoring, type ModelRun, type MonitoringResponse,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { Card, Kpi, Loading, ErrorState, PublicDataFooter } from "./primitives";

export default function TelemetryOverview({ envId }: { envId: string }) {
  const [models, setModels] = useState<ModelRun[] | null>(null);
  const [mon, setMon] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getMonitoring(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
    ])
      .then(([mp, m]) => { setModels(mp.models); setMon(m); })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!models || !mon) return <Loading label="Loading console…" />;

  // Show the promoted champions specifically (not the runner-ups also present for comparison).
  const champions = models.filter((m) => m.model_alias === "champion");
  const anomaly = champions.find((m) => m.model_kind === "anomaly");
  const rul = champions.find((m) => m.model_kind === "rul");
  const f1 = anomaly ? anomaly.metrics.f1 : null;
  const rmse = rul ? rul.metrics.rmse : null;
  const promotedCount = champions.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Promoted models" value={String(promotedCount)} sub="champions in registry" />
        <Kpi label="Anomaly F1" value={f1 != null ? f1.toFixed(4) : "—"}
             sub={anomaly ? `${anomaly.model_name} v${anomaly.model_version}` : "n/a"} />
        <Kpi label="RUL RMSE" value={rmse != null ? rmse.toFixed(2) : "—"}
             sub={rul ? `${rul.model_name} v${rul.model_version}` : "n/a"} />
        <Kpi label="Predictions logged" value={String(mon.prediction_count)}
             sub={mon.rolling_anomaly_rate != null ? `${(mon.rolling_anomaly_rate * 100).toFixed(0)}% no-go` : "no scores yet"} />
      </div>

      <Card className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-bm-muted2">
          The operated loop
        </p>
        <pre className="overflow-x-auto whitespace-pre text-[11px] leading-relaxed text-bm-muted">
{`NASA datasets → Databricks Bronze/Silver/Gold → MLflow training → registry + promotion gate
              → FastAPI /score → Supabase prediction log → this console → drift monitoring`}
        </pre>
        <p className="text-xs text-bm-muted">
          Real tools: Databricks (Unity Catalog novendor_1.telemetry), MLflow registry, FastAPI,
          Supabase, Next.js. Every number on this page is fetched from the serving API.
        </p>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href={`/lab/env/${envId}/telemetry/replay`}
              className="rounded-md bg-bm-accent px-4 py-2 text-sm font-semibold text-[hsl(220_18%_10%)] hover:opacity-90">
          Run the replay →
        </Link>
        <Link href={`/lab/env/${envId}/telemetry/model-performance`}
              className="rounded-md border border-bm-border/70 px-4 py-2 text-sm text-bm-muted hover:text-bm-text">
          Model performance
        </Link>
        <Link href={`/lab/env/${envId}/telemetry/monitoring`}
              className="rounded-md border border-bm-border/70 px-4 py-2 text-sm text-bm-muted hover:text-bm-text">
          Monitoring
        </Link>
      </div>

      <PublicDataFooter />
    </div>
  );
}
