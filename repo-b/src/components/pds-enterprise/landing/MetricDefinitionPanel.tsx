"use client";

import { useEffect, useState } from "react";
import { bosFetch } from "@/lib/bos-api";
import type { PdsMetricResult } from "@/types/pds";

type MetricDefinition = {
  name: string;
  definition: string;
  supported_grains: string[];
  source_tables: string[];
  compute_fn: string;
  validation_checks: string[];
  tolerance_class: string;
  tolerance_value: number;
  sample_receipt_shape: Record<string, unknown>;
};

type Props = {
  metricName: string | null;
  metric: PdsMetricResult | null;
  onClose: () => void;
};

export function MetricDefinitionPanel({ metricName, metric, onClose }: Props) {
  const [definition, setDefinition] = useState<MetricDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!metricName) return;
    setDefinition(null);
    setError(null);
    bosFetch<MetricDefinition>(`/api/pds/v1/metrics/${metricName}/definition`)
      .then(setDefinition)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load definition"),
      );
  }, [metricName]);

  if (!metricName) return null;

  return (
    <aside
      role="dialog"
      aria-label={`${metricName} definition`}
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-bm-border/70 bg-bm-surface/95 backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-bm-border/60 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
            Metric definition
          </p>
          <h3 className="text-lg font-semibold text-bm-text">{metricName}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-bm-border/60 px-2 py-1 text-xs text-bm-muted2 hover:text-bm-text"
        >
          Close
        </button>
      </div>

      <div className="space-y-4 p-4 text-sm text-bm-text">
        {error ? (
          <p className="text-pds-signalRed">⚠ {error}</p>
        ) : null}

        {definition ? (
          <>
            <Section title="Definition">
              <p className="text-bm-muted2">{definition.definition}</p>
            </Section>
            <Section title="Grain">
              <p className="font-mono text-xs text-bm-muted2">
                supported: {definition.supported_grains.join(", ")}
              </p>
              {metric ? (
                <p className="mt-1 text-xs text-bm-muted2">
                  computed at: <span className="text-bm-text">{metric.grain}</span>
                </p>
              ) : null}
            </Section>
            <Section title="Source tables">
              <ul className="list-disc pl-4 text-xs text-bm-muted2">
                {definition.source_tables.map((t) => (
                  <li key={t} className="font-mono">
                    {t}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Validation checks">
              <ul className="list-disc pl-4 text-xs text-bm-muted2">
                {definition.validation_checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Section>
            <Section title="Tolerance class">
              <p className="text-xs text-bm-muted2">
                {definition.tolerance_class} (±{definition.tolerance_value})
              </p>
            </Section>
            <Section title="Compute function">
              <p className="font-mono text-[11px] text-bm-muted2">
                {definition.compute_fn}
              </p>
            </Section>
          </>
        ) : !error ? (
          <p className="text-bm-muted2">Loading definition…</p>
        ) : null}

        {metric ? (
          <Section title="Live receipt">
            <div className="space-y-1 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2 text-[11px] text-bm-muted2">
              <p>
                timestamp:{" "}
                <span className="font-mono text-bm-text">{metric.receipt.timestamp}</span>
              </p>
              <p>
                grain:{" "}
                <span className="font-mono text-bm-text">{metric.receipt.grain}</span>
              </p>
              <details>
                <summary className="cursor-pointer text-bm-text">View SQL</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] text-bm-text">
                  {metric.receipt.sql}
                </pre>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-bm-muted2">
                  params: {JSON.stringify(metric.receipt.params)}
                </pre>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-bm-muted2">
                  filters: {JSON.stringify(metric.receipt.filters)}
                </pre>
              </details>
            </div>
            {metric.suppressed_count ? (
              <p className="mt-2 text-xs text-pds-signalRed">
                ⚠ {metric.suppressed_count} records excluded —{" "}
                {metric.suppression_reasons.join("; ") || "see Data Health"}
              </p>
            ) : null}
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </section>
  );
}
