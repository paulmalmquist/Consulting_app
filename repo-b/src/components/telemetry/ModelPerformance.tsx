"use client";

import { useEffect, useState } from "react";
import {
  getModelPerformance, type ModelRun,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { Card, Loading, ErrorState, Unavailable, PublicDataFooter } from "./primitives";

function metric(m: ModelRun, k: string): string {
  const v = m.metrics[k];
  return v == null ? "—" : Number(v).toFixed(k === "rmse" || k === "phm" ? 2 : 4);
}

export default function ModelPerformance() {
  const [models, setModels] = useState<ModelRun[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((d) => { setModels(d.models); setNullReason(d.null_reason); })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!models) return <Loading label="Loading model metrics…" />;
  if (nullReason) return <Unavailable reason={nullReason} />;

  const anomaly = models.filter((m) => m.model_kind === "anomaly");
  const rul = models.filter((m) => m.model_kind === "rul");

  return (
    <div className="space-y-6">
      <Card>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-bm-muted2">
          Anomaly detection — SMAP/MSL (point-adjusted, labeled test split)
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/60 text-left text-[11px] uppercase tracking-wider text-bm-muted2">
              <th className="pb-2">Model</th><th className="pb-2">Precision</th>
              <th className="pb-2">Recall</th><th className="pb-2">F1</th>
              <th className="pb-2">Run</th><th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {anomaly.map((m) => (
              <tr key={m.mlflow_run_id} className="border-b border-bm-border/30">
                <td className="py-2 text-bm-text">{m.model_name}</td>
                <td className="tabular-nums text-bm-muted">{metric(m, "precision")}</td>
                <td className="tabular-nums text-bm-muted">{metric(m, "recall")}</td>
                <td className="tabular-nums font-semibold text-bm-text">{metric(m, "f1")}</td>
                <td className="font-mono text-[11px] text-bm-muted2">{m.mlflow_run_id.slice(0, 10)}</td>
                <td>
                  <span className={m.model_alias === "champion"
                    ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300"
                    : "rounded-full border border-bm-border/60 bg-bm-surface/40 px-2 py-0.5 text-[11px] text-bm-muted"}>
                    {m.model_alias === "champion" ? "promoted" : m.promotion_state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-bm-muted2">
          Remaining useful life — C-MAPSS FD001 (100 test units)
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/60 text-left text-[11px] uppercase tracking-wider text-bm-muted2">
              <th className="pb-2">Model</th><th className="pb-2">RMSE</th>
              <th className="pb-2">PHM</th><th className="pb-2">Run</th><th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rul.map((m) => (
              <tr key={m.mlflow_run_id} className="border-b border-bm-border/30">
                <td className="py-2 text-bm-text">{m.model_name}</td>
                <td className="tabular-nums font-semibold text-bm-text">{metric(m, "rmse")}</td>
                <td className="tabular-nums text-bm-muted">{metric(m, "phm")}</td>
                <td className="font-mono text-[11px] text-bm-muted2">{m.mlflow_run_id.slice(0, 10)}</td>
                <td>
                  <span className={m.model_alias === "champion"
                    ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300"
                    : "rounded-full border border-bm-border/60 bg-bm-surface/40 px-2 py-0.5 text-[11px] text-bm-muted"}>
                    {m.model_alias === "champion" ? "promoted" : m.promotion_state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="text-[11px] leading-relaxed text-bm-muted2">
        Gates declared before training: anomaly F1 ≥ 0.30, RUL RMSE ≤ 25. Values fetched live from the
        registry-backed serving API (tel_model_runs). The simpler MAD baseline beat the PCA model on
        F1, so it was promoted — recorded honestly rather than forcing a fancier model to win.
      </Card>
      <PublicDataFooter />
    </div>
  );
}
