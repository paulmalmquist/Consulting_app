"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchHhaFunnel,
  type HhaFunnel,
  type HhaKpi,
  type HhaMetricDefinition,
} from "@/lib/healthcare-subscription/client";
import {
  Banner,
  C,
  DefinitionButton,
  Drawer,
  Footer,
  formatCount,
  formatCurrency,
  formatPercent,
  HhaNav,
  metricKpi,
} from "@/components/healthcare-subscription/primitives";

function getDefinition(data: HhaFunnel, key: string): HhaMetricDefinition | null {
  return data.definitions.find((definition) => definition.key === key) ?? null;
}

export default function FunnelClient({ envId }: { envId: string }) {
  const [data, setData] = useState<HhaFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HhaKpi | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHhaFunnel(envId)
      .then((response) => {
        if (!alive) return;
        if (!response) setError("Funnel data is not available for this environment yet.");
        else setData(response);
      })
      .catch((err) => alive && setError(String(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [envId]);

  const maxEntered = useMemo(
    () => Math.max(...(data?.blended_stages.map((stage) => stage.entered_count ?? 0) ?? [0]), 1),
    [data],
  );

  const openDefinition = (
    definition: HhaMetricDefinition | null,
    value: number | null,
    kind: "percent" | "currency",
  ) => {
    if (!definition) return;
    setSelected(metricKpi(
      definition,
      value,
      kind,
      kind === "percent" ? "fraction" : "usd",
    ));
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 28px 64px" }}>
        <div style={{ fontFamily: C.mono, color: C.accent, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>
          Healthcare Subscription Analytics
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 650, margin: "0 0 8px", lineHeight: 1.15 }}>
          Acquisition funnel
        </h1>
        <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.5, margin: "0 0 22px", maxWidth: 760 }}>
          Blended lifecycle progression from visitor through first-month retention, with
          channel CAC and conversion performance from the seeded gold rollup.
        </p>

        <HhaNav envId={envId} />
        <Banner />

        {loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, padding: "40px 0" }}>
            Loading funnel...
          </div>
        )}
        {error && !loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.bad, border: `1px solid ${C.bad}44`, borderRadius: 8, padding: 16 }}>
            {error}
          </div>
        )}
        {data && !loading && (
          <>
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18 }}>
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Blended progression
                  </div>
                  <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                    Width is proportional to members entering each stage.
                  </div>
                </div>
                <DefinitionButton
                  label="Conversion definition"
                  onClick={() => openDefinition(getDefinition(data, "funnel_conversion"), null, "percent")}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {data.blended_stages.map((stage, index) => {
                  const width = Math.max(12, ((stage.entered_count ?? 0) / maxEntered) * 100);
                  const next = data.blended_stages[index + 1];
                  return (
                    <div key={stage.stage_key}>
                      <button
                        type="button"
                        onClick={() => openDefinition(getDefinition(data, "funnel_conversion"), stage.conversion_pct, "percent")}
                        style={{
                          width: `${width}%`,
                          minWidth: 170,
                          textAlign: "left",
                          background: index % 2 === 0 ? C.panelHi : "#102622",
                          border: `1px solid ${C.accent}33`,
                          borderRadius: 8,
                          padding: "11px 13px",
                          color: C.text,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <strong style={{ fontSize: 13 }}>{stage.stage_label}</strong>
                          <span style={{ fontFamily: C.mono, fontSize: 12 }}>
                            {formatCount(stage.entered_count)}
                          </span>
                        </span>
                      </button>
                      {next && (
                        <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, padding: "5px 0 0 13px" }}>
                          {formatPercent(stage.conversion_pct)} continue to {next.stage_label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section style={{ marginTop: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Channel efficiency
                  </div>
                  <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                    CAC dollars and stage conversion fractions by acquisition channel.
                  </div>
                </div>
                <DefinitionButton
                  label="CAC definition"
                  onClick={() => openDefinition(getDefinition(data, "channel_cac"), null, "currency")}
                />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 850, borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: C.faint, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <th style={{ textAlign: "left", padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>Channel</th>
                      <th style={{ textAlign: "right", padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>CAC</th>
                      {data.blended_stages.map((stage) => (
                        <th key={stage.stage_key} style={{ textAlign: "right", padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>
                          {stage.stage_key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((channel) => (
                      <tr key={channel.channel}>
                        <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.border}`, color: C.text, fontFamily: C.mono }}>
                          {channel.channel.replaceAll("_", " ")}
                        </td>
                        <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => openDefinition(getDefinition(data, "channel_cac"), channel.cac_dollars, "currency")}
                            style={{ border: 0, background: "transparent", color: C.accentSoft, cursor: "pointer", fontFamily: C.mono }}
                          >
                            {formatCurrency(channel.cac_dollars)}
                          </button>
                        </td>
                        {data.blended_stages.map((stage) => {
                          const channelStage = channel.stages.find((item) => item.stage_key === stage.stage_key);
                          return (
                            <td key={stage.stage_key} style={{ padding: "11px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
                              <button
                                type="button"
                                disabled={!channelStage}
                                onClick={() => openDefinition(getDefinition(data, "funnel_conversion"), channelStage?.conversion_pct ?? null, "percent")}
                                style={{ border: 0, background: "transparent", color: channelStage ? C.text : C.faint, cursor: channelStage ? "pointer" : "default", fontFamily: C.mono }}
                              >
                                {formatPercent(channelStage?.conversion_pct ?? null)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
