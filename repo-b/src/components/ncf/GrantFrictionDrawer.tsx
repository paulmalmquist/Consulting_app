"use client";

import { useEffect, useState } from "react";

type Driver = {
  feature: string;
  direction: "+" | "-";
  contribution: number;
};

type Score = {
  grant_id: string;
  risk_score: number | null;
  risk_band: "low" | "watch" | "high" | null;
  top_drivers: Driver[];
  prediction_timestamp: string | null;
  model_version: string | null;
  calibration_brier: number | null;
  confidence_note: string | null;
  null_reason: string | null;
};

type Props = {
  envId: string;
  grantId: string;
  onClose: () => void;
};

export default function GrantFrictionDrawer({ envId, grantId, onClose }: Props) {
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/v1/ncf/grant-friction/${encodeURIComponent(grantId)}?env_id=${encodeURIComponent(envId)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`http ${r.status}`))))
      .then((data: Score) => {
        if (!cancelled) setScore(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [envId, grantId]);

  const unavailable = score?.null_reason != null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Grant friction risk
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              Grant {grantId.slice(0, 8)}&hellip;
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
              Failed to load prediction: {error}
            </div>
          ) : score == null ? (
            <div className="text-sm text-slate-500">Loading&hellip;</div>
          ) : unavailable ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Not available in current context. Reason: <span className="font-mono text-xs">{score.null_reason}</span>.
              No prediction has been produced for this grant yet.
            </div>
          ) : (
            <>
              <section>
                <div className="text-4xl font-semibold tracking-tight text-slate-900">
                  {(score.risk_score! * 100).toFixed(1)}%
                </div>
                <div className="mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{
                    backgroundColor:
                      score.risk_band === "high" ? "#fde8e8" :
                      score.risk_band === "watch" ? "#fef3c7" : "#eef6e9",
                    color:
                      score.risk_band === "high" ? "#9b2c2c" :
                      score.risk_band === "watch" ? "#92400e" : "#3f7a24",
                  }}
                >
                  {score.risk_band} band
                </div>
                {score.confidence_note ? (
                  <p className="mt-3 text-xs text-slate-500">Note: {score.confidence_note}</p>
                ) : null}
              </section>

              <section>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Top drivers
                </div>
                {score.top_drivers.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No driver detail available.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                    {score.top_drivers.map((d) => (
                      <li key={d.feature} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                        <span className="font-mono text-xs">{d.feature}</span>
                        <span className="text-xs">
                          <span className={d.direction === "+" ? "text-rose-600" : "text-emerald-600"}>
                            {d.direction}
                          </span>{" "}
                          {d.contribution.toFixed(3)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Model provenance
                </div>
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Version</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-800">{score.model_version}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Calibration (Brier)</div>
                    <div className="mt-1 text-slate-800">
                      {score.calibration_brier != null ? score.calibration_brier.toFixed(4) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Prediction timestamp</div>
                    <div className="mt-1 text-slate-800">{score.prediction_timestamp}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <div className="font-semibold">Decision support, not a decision gate.</div>
                <div className="mt-1 leading-5">
                  This is a queue-ordering signal. Watch-band grants deserve a second look; high-band grants deserve a call with the office. The reviewer owns the outcome.
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
