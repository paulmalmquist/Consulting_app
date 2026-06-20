"use client";

import { useEffect, useState } from "react";
import {
  fetchHhaOverview,
  type HhaKpi,
  type HhaOverview,
} from "@/lib/healthcare-subscription/client";
import {
  Banner,
  C,
  Drawer,
  Footer,
  HhaNav,
  KpiCard,
} from "@/components/healthcare-subscription/primitives";

export default function OverviewClient({ envId }: { envId: string }) {
  const [data, setData] = useState<HhaOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HhaKpi | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHhaOverview(envId)
      .then((response) => {
        if (!alive) return;
        if (!response) setError("Overview data is not available for this environment yet.");
        else setData(response);
      })
      .catch((err) => alive && setError(String(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [envId]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 28px 64px" }}>
        <div
          style={{
            marginBottom: 6,
            fontFamily: C.mono,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: C.accent,
          }}
        >
          Healthcare Subscription Analytics
        </div>
        <h1
          style={{
            fontFamily: C.sans,
            fontSize: 30,
            fontWeight: 650,
            margin: "0 0 8px",
            lineHeight: 1.15,
          }}
        >
          The operating layer for a longevity-membership business
        </h1>
        <p
          style={{
            fontFamily: C.sans,
            fontSize: 14.5,
            color: C.dim,
            maxWidth: 760,
            margin: "0 0 22px",
            lineHeight: 1.5,
          }}
        >
          Membership economics, acquisition funnel, signup-cohort retention, and
          care-operations SLAs{" \u2014 "}every number read from the serving API,
          governed by a single metric definition, and kept strictly separate from
          clinical decisioning.
        </p>

        <HhaNav envId={envId} />
        <Banner />

        {loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, padding: "40px 0" }}>
            Loading console...
          </div>
        )}
        {error && !loading && (
          <div
            style={{
              fontFamily: C.mono,
              fontSize: 13,
              color: C.bad,
              border: `1px solid ${C.bad}44`,
              borderRadius: 8,
              padding: 16,
            }}
          >
            {error}
          </div>
        )}
        {data && !loading && (
          <>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))",
              }}
            >
              {data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} k={kpi} onOpen={setSelected} />
              ))}
            </div>
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
