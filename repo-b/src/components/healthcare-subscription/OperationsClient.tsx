"use client";

import { useEffect, useState } from "react";
import {
  fetchHhaOperations,
  type HhaKpi,
  type HhaMetricDefinition,
  type HhaOperations,
} from "@/lib/healthcare-subscription/client";
import {
  Banner,
  C,
  DefinitionButton,
  Drawer,
  Footer,
  formatCount,
  formatPercent,
  HhaNav,
  metricKpi,
} from "@/components/healthcare-subscription/primitives";

function getDefinition(data: HhaOperations, key: string): HhaMetricDefinition | null {
  return data.definitions.find((definition) => definition.key === key) ?? null;
}

function formatHours(value: number | null): string {
  return value == null ? "\u2014" : `${value.toFixed(1)}h`;
}

export default function OperationsClient({ envId }: { envId: string }) {
  const [data, setData] = useState<HhaOperations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HhaKpi | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHhaOperations(envId)
      .then((response) => {
        if (!alive) return;
        if (!response) setError("Operations data is not available for this environment yet.");
        else setData(response);
      })
      .catch((err) => alive && setError(String(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [envId]);

  const openDefinition = (
    definition: HhaMetricDefinition | null,
    value: number | null,
    fmt: "percent" | "count" | "hours",
    unit: string,
  ) => {
    if (!definition) return;
    setSelected(metricKpi(definition, value, fmt, unit));
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 28px 64px" }}>
        <div style={{ fontFamily: C.mono, color: C.accent, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>
          Healthcare Subscription Analytics
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 650, margin: "0 0 8px", lineHeight: 1.15 }}>
          Care operations
        </h1>
        <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.5, margin: "0 0 22px", maxWidth: 780 }}>
          Turnaround performance, SLA breach rates, volume, and backlog across labs,
          consults, fulfillment, and support.
        </p>

        <HhaNav envId={envId} />
        <Banner />

        {loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, padding: "40px 0" }}>
            Loading operations...
          </div>
        )}
        {error && !loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.bad, border: `1px solid ${C.bad}44`, borderRadius: 8, padding: 16 }}>
            {error}
          </div>
        )}
        {data && !loading && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
              <DefinitionButton
                label="Turnaround definition"
                onClick={() => openDefinition(getDefinition(data, "ops_turnaround"), null, "hours", "hours")}
              />
              <DefinitionButton
                label="Breach definition"
                onClick={() => openDefinition(getDefinition(data, "ops_breach"), null, "percent", "fraction")}
              />
              <DefinitionButton
                label="Backlog definition"
                onClick={() => openDefinition(getDefinition(data, "ops_backlog"), null, "count", "count")}
              />
            </div>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 14 }}>
              {data.domains.map((domain) => {
                const warning = domain.over_sla === true;
                return (
                  <article
                    key={domain.ops_domain}
                    style={{
                      background: warning ? `${C.warn}0d` : C.panel,
                      border: `1px solid ${warning ? `${C.warn}66` : C.border}`,
                      borderRadius: 10,
                      padding: 17,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: warning ? C.warn : C.accent }}>
                          {domain.ops_domain}
                        </div>
                        <h2 style={{ margin: "5px 0 0", fontSize: 17, fontWeight: 600 }}>
                          {domain.metric_label ?? domain.ops_domain}
                        </h2>
                      </div>
                      <span style={{ border: `1px solid ${warning ? `${C.warn}66` : `${C.good}55`}`, color: warning ? C.warn : C.good, background: warning ? `${C.warn}10` : `${C.good}0d`, borderRadius: 999, padding: "4px 8px", fontFamily: C.mono, fontSize: 9.5, whiteSpace: "nowrap" }}>
                        {domain.over_sla == null ? "comparison unavailable" : warning ? "p90 over SLA" : "within SLA"}
                      </span>
                    </div>

                    <div style={{ marginTop: 17, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {[
                        ["Target", domain.sla_target_hours],
                        ["p50", domain.sla_actual_p50_hours],
                        ["p90", domain.sla_actual_p90_hours],
                      ].map(([label, value]) => (
                        <button
                          type="button"
                          key={label}
                          onClick={() => openDefinition(getDefinition(data, "ops_turnaround"), value as number | null, "hours", "hours")}
                          style={{ border: `1px solid ${C.border}`, background: C.panelHi, borderRadius: 7, padding: "10px 6px", cursor: "pointer", color: C.text }}
                        >
                          <span style={{ display: "block", fontFamily: C.mono, fontSize: 9.5, color: C.faint, textTransform: "uppercase" }}>
                            {label}
                          </span>
                          <span style={{ display: "block", fontFamily: C.mono, fontSize: 16, marginTop: 4, color: label === "p90" && warning ? C.warn : C.text }}>
                            {formatHours(value as number | null)}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => openDefinition(getDefinition(data, "ops_breach"), domain.sla_breach_pct, "percent", "fraction")}
                        style={{ border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", textAlign: "left", padding: "10px 2px 0", cursor: "pointer", color: C.text }}
                      >
                        <span style={{ display: "block", fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>Breach</span>
                        <strong style={{ display: "block", marginTop: 3, color: warning ? C.warn : C.text }}>{formatPercent(domain.sla_breach_pct)}</strong>
                      </button>
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 2px 0" }}>
                        <span style={{ display: "block", fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>Volume</span>
                        <strong style={{ display: "block", marginTop: 3 }}>{formatCount(domain.volume)}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => openDefinition(getDefinition(data, "ops_backlog"), domain.backlog_count, "count", "count")}
                        style={{ border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", textAlign: "left", padding: "10px 2px 0", cursor: "pointer", color: C.text }}
                      >
                        <span style={{ display: "block", fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>Backlog</span>
                        <strong style={{ display: "block", marginTop: 3 }}>{formatCount(domain.backlog_count)}</strong>
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>

            <Footer
              asOfDate={data.as_of_date}
              sourceFreshnessAt={data.source_freshness_at}
              provenanceLabel={data.provenance_label}
              disclaimer={data.disclaimer}
            />
          </>
        )}
      </div>
      {selected && <Drawer k={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
