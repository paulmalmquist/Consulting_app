"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchHhaCohorts,
  type HhaCohortCell,
  type HhaCohorts,
  type HhaKpi,
  type HhaMetricDefinition,
} from "@/lib/healthcare-subscription/client";
import {
  Banner,
  C,
  DefinitionButton,
  Drawer,
  Footer,
  formatCurrency,
  formatPercent,
  HhaNav,
  metricKpi,
} from "@/components/healthcare-subscription/primitives";

const MONTHS = Array.from({ length: 12 }, (_, index) => index);

function monthLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getDefinition(data: HhaCohorts, key: string): HhaMetricDefinition | null {
  return data.definitions.find((definition) => definition.key === key) ?? null;
}

export default function CohortsClient({ envId }: { envId: string }) {
  const [data, setData] = useState<HhaCohorts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HhaKpi | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHhaCohorts(envId)
      .then((response) => {
        if (!alive) return;
        if (!response) setError("Cohort data is not available for this environment yet.");
        else setData(response);
      })
      .catch((err) => alive && setError(String(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [envId]);

  const cohortMonths = useMemo(
    () => Array.from(new Set(data?.cells.map((cell) => cell.signup_cohort_month) ?? [])).sort(),
    [data],
  );
  const cellMap = useMemo(() => {
    const map = new Map<string, HhaCohortCell>();
    for (const cell of data?.cells ?? []) {
      map.set(`${cell.signup_cohort_month}:${cell.months_since_signup}`, cell);
    }
    return map;
  }, [data]);
  const latestByMonth = useMemo(() => {
    const map = new Map<string, HhaCohortCell>();
    for (const cell of data?.cells ?? []) {
      const current = map.get(cell.signup_cohort_month);
      if (!current || cell.months_since_signup > current.months_since_signup) {
        map.set(cell.signup_cohort_month, cell);
      }
    }
    return map;
  }, [data]);

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
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 28px 64px" }}>
        <div style={{ fontFamily: C.mono, color: C.accent, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>
          Healthcare Subscription Analytics
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 650, margin: "0 0 8px", lineHeight: 1.15 }}>
          Retention cohorts
        </h1>
        <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.5, margin: "0 0 22px", maxWidth: 780 }}>
          Monthly signup-cohort retention through M11, with locked denominators,
          tenure-based LTV, and service-layer suppression for groups smaller than 11.
        </p>

        <HhaNav envId={envId} />
        <Banner />

        {loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, padding: "40px 0" }}>
            Loading cohorts...
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Channel: all
                  </div>
                  <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                    Percent retained; count detail appears below each visible cell.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <DefinitionButton
                    label="Retention definition"
                    onClick={() => openDefinition(getDefinition(data, "cohort_retention"), null, "percent")}
                  />
                  <DefinitionButton
                    label="LTV definition"
                    onClick={() => openDefinition(getDefinition(data, "cohort_ltv"), null, "currency")}
                  />
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 1280, borderCollapse: "separate", borderSpacing: 4 }}>
                  <thead>
                    <tr style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <th style={{ textAlign: "left", padding: "7px 8px", minWidth: 110 }}>Cohort</th>
                      {MONTHS.map((month) => (
                        <th key={month} style={{ textAlign: "center", padding: "7px 4px", minWidth: 78 }}>
                          M{month}
                        </th>
                      ))}
                      <th style={{ textAlign: "right", padding: "7px 8px", minWidth: 95 }}>Latest LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortMonths.map((cohortMonth) => {
                      const latest = latestByMonth.get(cohortMonth);
                      return (
                        <tr key={cohortMonth}>
                          <td style={{ fontFamily: C.mono, fontSize: 11, color: C.text, padding: "7px 8px", whiteSpace: "nowrap" }}>
                            {monthLabel(cohortMonth)}
                          </td>
                          {MONTHS.map((month) => {
                            const cell = cellMap.get(`${cohortMonth}:${month}`);
                            if (!cell) {
                              return (
                                <td key={month} style={{ background: "#0c1716", borderRadius: 6, textAlign: "center", color: C.faint, fontFamily: C.mono }}>
                                  {"\u2014"}
                                </td>
                              );
                            }
                            const alpha = 0.08 + Math.max(0, Math.min(1, cell.retention_pct ?? 0)) * 0.22;
                            return (
                              <td key={month} style={{ padding: 0 }}>
                                <button
                                  type="button"
                                  title="View retention definition"
                                  onClick={() => openDefinition(getDefinition(data, "cohort_retention"), cell.retention_pct, "percent")}
                                  style={{
                                    width: "100%",
                                    minHeight: 54,
                                    border: `1px solid ${C.accent}22`,
                                    borderRadius: 6,
                                    background: `rgba(45, 212, 191, ${alpha})`,
                                    color: C.text,
                                    cursor: "pointer",
                                    fontFamily: C.mono,
                                    padding: "7px 4px",
                                  }}
                                >
                                  <span style={{ display: "block", fontSize: 12, color: C.accentSoft }}>
                                    {formatPercent(cell.retention_pct)}
                                  </span>
                                  <span style={{ display: "block", fontSize: 9.5, color: C.faint, marginTop: 3 }}>
                                    {cell.retained_count == null ? "\u2014" : cell.retained_count.toLocaleString()}
                                    {" / "}
                                    {cell.cohort_size.toLocaleString()}
                                  </span>
                                </button>
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "right", padding: "0 8px" }}>
                            <button
                              type="button"
                              onClick={() => openDefinition(getDefinition(data, "cohort_ltv"), latest?.ltv_dollars ?? null, "currency")}
                              style={{ border: 0, background: "transparent", color: C.accentSoft, cursor: "pointer", fontFamily: C.mono }}
                            >
                              {formatCurrency(latest?.ltv_dollars ?? null)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {data.masked_cohorts.map((masked) => (
                      <tr key={`${masked.channel}:${masked.signup_cohort_month}`}>
                        <td style={{ fontFamily: C.mono, fontSize: 11, color: C.warn, padding: "7px 8px", whiteSpace: "nowrap" }}>
                          {masked.channel.replaceAll("_", " ")}
                          <div style={{ color: C.faint, fontSize: 9.5, marginTop: 2 }}>
                            {monthLabel(masked.signup_cohort_month)}
                          </div>
                        </td>
                        <td colSpan={12} style={{ padding: "5px 4px" }}>
                          <span style={{ display: "inline-block", border: `1px solid ${C.warn}55`, background: `${C.warn}12`, color: C.warn, borderRadius: 999, padding: "7px 12px", fontFamily: C.mono, fontSize: 10.5 }}>
                            {masked.reason}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", padding: "0 8px", color: C.faint, fontFamily: C.mono }}>
                          {"\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ marginTop: 18, border: `1px solid ${C.warn}44`, background: `${C.warn}0b`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.warn, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Channel LTV:CAC unavailable
              </div>
              <p style={{ margin: "7px 0 0", color: C.dim, fontSize: 13, lineHeight: 1.5 }}>
                {data.ltv_cac_unavailable_reason}
              </p>
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
