"use client";

import type { RoutingEngagementDetail } from "@/lib/cro-api";

const FG_1 = "#E6EDF7";
const FG_2 = "#A9B4C4";
const FG_3 = "#6B7891";
const BORDER = "rgba(105, 120, 145, 0.18)";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function CheckRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 2,
          background: ok ? "rgba(0, 229, 160, 0.18)" : "rgba(255, 59, 92, 0.18)",
          border: `1px solid ${ok ? "rgba(0, 229, 160, 0.6)" : "rgba(255, 59, 92, 0.55)"}`,
          color: ok ? "#00E5A0" : "#FF3B5C",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          marginTop: 2,
        }}
      >
        {ok ? "✓" : "—"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: ok ? FG_1 : FG_2 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 10, color: FG_3, marginTop: 2 }}>{hint}</div>
        )}
      </div>
    </div>
  );
}

export function RoutingHealthRail({ detail }: { detail: RoutingEngagementDetail }) {
  const e = detail.engagement;
  const reasons = new Set(e.routing_health.routing_health_reasons);

  const checks = [
    { label: "Contracting entity is Novendor LLC", ok: e.contracting_entity === "Novendor LLC" },
    { label: "Signed contract exists", ok: detail.contracts.some((c) => c.is_fully_executed) },
    { label: "Revenue stream defined", ok: detail.revenue_streams.length > 0 },
    { label: "Attribution / economics split defined", ok: detail.attribution.length > 0 },
    { label: "Relationship owner assigned", ok: !!e.relationship_owner_user_id },
    { label: "Delivery owner assigned", ok: !!e.delivery_owner_user_id },
    { label: "Next action exists", ok: !!(e.next_action_text || e.next_action_task_id) },
    { label: "Invoice path exists", ok: detail.invoices.length > 0 || detail.revenue_streams.length > 0 },
  ];

  const headlineColor =
    e.routing_health.routing_health_status === "green"
      ? "#00E5A0"
      : e.routing_health.routing_health_status === "yellow"
        ? "#FFB020"
        : "#FF3B5C";
  const headline =
    e.routing_health.routing_health_status === "green"
      ? "Compounding Novendor"
      : e.routing_health.routing_health_status === "yellow"
        ? "Fix routing gaps"
        : "Personal / Non-Compounding";

  return (
    <aside
      style={{
        height: "100%",
        overflowY: "auto",
        padding: 14,
        background: "#0A0E14",
        borderLeft: `1px solid ${BORDER}`,
        fontFamily: "var(--font-plex-sans)",
        color: FG_1,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FG_3,
            fontFamily: "var(--font-jetbrains-mono)",
          }}
        >
          Routing Health
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: headlineColor,
            marginTop: 4,
            letterSpacing: "0.04em",
          }}
        >
          {headline}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        {checks.map((c) => (
          <CheckRow key={c.label} label={c.label} ok={c.ok} />
        ))}
      </div>

      {detail.recommended_next_actions.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: FG_3,
              fontFamily: "var(--font-jetbrains-mono)",
              marginBottom: 8,
            }}
          >
            Next Actions
          </div>
          {detail.recommended_next_actions.map((action, idx) => (
            <div
              key={idx}
              style={{
                padding: "6px 8px",
                marginBottom: 4,
                background: "rgba(0, 229, 255, 0.05)",
                border: "1px solid rgba(0, 229, 255, 0.2)",
                fontSize: 11,
                color: "#00E5FF",
                fontFamily: "var(--font-jetbrains-mono)",
              }}
            >
              {action}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FG_3,
            fontFamily: "var(--font-jetbrains-mono)",
            marginBottom: 8,
          }}
        >
          Revenue Snapshot
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: "var(--font-jetbrains-mono)" }}>
          {[
            ["Contract", e.contract_value],
            ["Billed", e.billed_amount],
            ["Collected", e.collected_amount],
            ["Outstanding", e.outstanding_amount],
          ].map(([label, val]) => (
            <div key={label as string} style={{ padding: 8, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 9, color: FG_3, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 14, color: FG_1, marginTop: 2 }}>{fmt(val as number)}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FG_3,
            fontFamily: "var(--font-jetbrains-mono)",
            marginBottom: 8,
          }}
        >
          Case Study Readiness
        </div>
        {[
          ["Pain captured", !!detail.current_pain],
          ["Solution captured", !!detail.what_winston_replaces],
          ["ROI angle captured", !!detail.expected_roi_angle],
          ["Permission status", detail.marketing_permission_status !== "unknown"],
        ].map(([label, ok]) => (
          <CheckRow key={label as string} label={label as string} ok={ok as boolean} />
        ))}
      </div>
    </aside>
  );
}
