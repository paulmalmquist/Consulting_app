"use client";

import { useEffect, useState } from "react";
import { getWorkbenchFeatureManifest, type ReceiptEnvelope } from "@/lib/telemetry/api";
import { C, Tag, Loading, EmptyState } from "../primitives";

const ACCENT = "#a855f7";

interface Feature {
  name: string;
  calc: string;
  leakage_risk: string;
}
interface FeatureSet {
  id: string;
  label: string;
  purpose: string;
  model_family: string;
  included: boolean;
  features: Feature[];
  leakage_notes: string;
}
interface ManifestPayload {
  feature_sets: FeatureSet[];
  note?: string;
}

function riskColor(r: string): string {
  if (r === "none") return C.green;
  if (r === "low") return C.amber;
  return C.red;
}

export function FeatureSetSelector() {
  const [sets, setSets] = useState<FeatureSet[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkbenchFeatureManifest()
      .then((r: ReceiptEnvelope) => {
        setProvider(r.provider);
        setNullReason(r.null_reason);
        const payload = r.payload as ManifestPayload | null;
        const fs = payload?.feature_sets ?? [];
        setSets(fs);
        if (fs.length) setSelected(fs[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <EmptyState label="Feature sets unavailable" hint="The feature manifest receipt could not be loaded." nullReason={error} />;
  }
  if (!sets) return <Loading label="Loading feature sets…" />;
  if (nullReason || sets.length === 0) {
    return (
      <EmptyState
        label="Feature manifest not generated yet"
        hint="The A/B/C feature-set contract is produced by the GCP gold step (Part II)."
        nullReason={nullReason}
      />
    );
  }

  const active = sets.find((s) => s.id === selected) ?? sets[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Feature set</span>
        <Tag color={provider === "vertex" ? C.green : C.amber}>{provider ?? "local_fixture"}</Tag>
        <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>pick a starting point — baseline, then tighten</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sets.map((s) => {
          const on = s.id === active.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id)}
              aria-pressed={on}
              style={{
                cursor: "pointer",
                textAlign: "left",
                flex: "1 1 200px",
                background: on ? `${ACCENT}14` : C.panel,
                border: `1px solid ${on ? ACCENT : C.border}`,
                borderRadius: 10,
                padding: "12px 13px",
                color: C.text,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: C.mono, fontSize: 12.5, color: on ? C.text : C.dim }}>{s.label}</span>
                {s.included ? <Tag color={C.green}>champion inputs</Tag> : <Tag color={C.faint}>candidate</Tag>}
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.45 }}>{s.purpose}</div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8 }}>{s.model_family} · {s.features.length} features</div>
            </button>
          );
        })}
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 2fr 0.8fr", gap: 8, fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>Feature</span>
          <span>Calculation</span>
          <span>Leakage</span>
        </div>
        {active.features.map((f) => (
          <div key={f.name} style={{ display: "grid", gridTemplateColumns: "1.4fr 2fr 0.8fr", gap: 8, alignItems: "center", fontFamily: C.mono, fontSize: 11.5, color: C.text, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span>{f.name}</span>
            <span style={{ color: C.dim }}>{f.calc}</span>
            <span><Tag color={riskColor(f.leakage_risk)}>{f.leakage_risk}</Tag></span>
          </div>
        ))}
        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, marginTop: 10 }}>
          <span style={{ color: C.faint, fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Leakage notes — </span>
          {active.leakage_notes}
        </div>
      </div>
    </div>
  );
}

export default FeatureSetSelector;
