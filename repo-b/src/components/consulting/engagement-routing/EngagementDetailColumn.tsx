"use client";

import type { RoutingEngagementDetail } from "@/lib/cro-api";
import { CompoundingBadge, RoutingHealthBadge } from "./RoutingHealthBadge";

const FG_1 = "#E6EDF7";
const FG_2 = "#A9B4C4";
const FG_3 = "#6B7891";
const BORDER = "rgba(105, 120, 145, 0.18)";
const SECTION_BG = "#0E141C";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: SECTION_BG,
        border: `1px solid ${BORDER}`,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: FG_2,
          }}
        >
          {title}
        </h3>
        {action}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: FG_3,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontFamily: "var(--font-jetbrains-mono)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: FG_1,
          fontSize: 13,
          marginTop: 2,
          fontFamily: mono ? "var(--font-jetbrains-mono)" : "var(--font-plex-sans)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function EngagementDetailColumn({
  detail,
  onConvertToNovendor,
  onAddContract,
  onAddRevenueStream,
  onAddInvoice,
  onAddAttribution,
}: {
  detail: RoutingEngagementDetail;
  onConvertToNovendor: () => void;
  onAddContract: () => void;
  onAddRevenueStream: () => void;
  onAddInvoice: () => void;
  onAddAttribution: () => void;
}) {
  const e = detail.engagement;
  const isPersonal = e.routing_health.personal_risk;

  return (
    <div style={{ overflowY: "auto", height: "100%", padding: 16, background: "#05070B" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FG_3,
                fontFamily: "var(--font-jetbrains-mono)",
              }}
            >
              Engagement
            </div>
            <h1
              style={{
                margin: "4px 0 2px",
                fontSize: 22,
                fontWeight: 600,
                color: FG_1,
                fontFamily: "var(--font-plex-sans)",
              }}
            >
              {e.client_name}
            </h1>
            <div style={{ color: FG_2, fontSize: 13 }}>{e.name}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <RoutingHealthBadge health={e.routing_health} size="md" />
            <CompoundingBadge health={e.routing_health} />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 12,
            fontSize: 11,
            color: FG_2,
            fontFamily: "var(--font-jetbrains-mono)",
          }}
        >
          <span>
            <span style={{ color: FG_3 }}>STATUS </span>
            <span style={{ color: FG_1 }}>{e.routing_status.replace(/_/g, " ").toUpperCase()}</span>
          </span>
          <span>
            <span style={{ color: FG_3 }}>ENTITY </span>
            <span style={{ color: FG_1 }}>{e.contracting_entity}</span>
          </span>
        </div>
      </div>

      {/* 1. Routing Decision */}
      <Section
        title="Routing Decision"
        action={
          isPersonal && (
            <button
              type="button"
              onClick={onConvertToNovendor}
              style={{
                background: "rgba(0, 229, 255, 0.08)",
                border: "1px solid rgba(0, 229, 255, 0.45)",
                color: "#00E5FF",
                padding: "4px 10px",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontFamily: "var(--font-jetbrains-mono)",
                cursor: "pointer",
              }}
            >
              Convert to Novendor
            </button>
          )
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <Field label="Is this contracted through Novendor?" value={e.contracting_entity === "Novendor LLC" ? "Yes" : `No — ${e.contracting_entity}`} />
          <Field label="Who originated it?" value={e.originated_by_user_id || "—"} mono />
          <Field label="Who owns the relationship?" value={e.relationship_owner_user_id || "—"} mono />
          <Field label="Who is responsible for delivery?" value={e.delivery_owner_user_id || "—"} mono />
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          <Field
            label="What is the next action?"
            value={
              e.next_action_text ? (
                <span>
                  {e.next_action_text}
                  {e.next_action_due_date && (
                    <span style={{ marginLeft: 8, color: FG_3, fontFamily: "var(--font-jetbrains-mono)", fontSize: 11 }}>
                      due {fmtDate(e.next_action_due_date)}
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ color: "#FFB020" }}>Set next action</span>
              )
            }
          />
        </div>
      </Section>

      {/* 2. Contract Control */}
      <Section
        title="Contract Control"
        action={
          <button type="button" onClick={onAddContract} style={addBtnStyle}>
            + Add Contract
          </button>
        }
      >
        {detail.contracts.length === 0 ? (
          <div style={{ color: "#FFB020", fontSize: 12, fontFamily: "var(--font-jetbrains-mono)" }}>
            Missing contract — add one to compound Novendor.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {detail.contracts.map((c) => (
              <div key={c.id} style={{ padding: 10, border: `1px solid ${BORDER}`, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <Field label="Type" value={c.contract_type} mono />
                <Field
                  label="Status"
                  value={
                    <span style={{ color: c.is_fully_executed ? "#00E5A0" : "#FFB020" }}>
                      {c.status.replace(/_/g, " ")}
                    </span>
                  }
                  mono
                />
                <Field label="Effective" value={fmtDate(c.effective_date)} mono />
                <Field label="Terms" value={c.billing_terms || "—"} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 3. Revenue Structure */}
      <Section
        title="Revenue Structure — Where does the money go?"
        action={
          <button type="button" onClick={onAddRevenueStream} style={addBtnStyle}>
            + Define Revenue
          </button>
        }
      >
        {detail.revenue_streams.length === 0 ? (
          <div style={{ color: "#FFB020", fontSize: 12, fontFamily: "var(--font-jetbrains-mono)" }}>
            Revenue structure missing.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {detail.revenue_streams.map((rs) => (
              <div key={rs.id} style={{ padding: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  <Field label="Type" value={rs.revenue_type} mono />
                  <Field label="Total Value" value={fmt(rs.total_contract_value)} mono />
                  <Field label="Hourly" value={rs.hourly_rate ? `$${rs.hourly_rate}` : "—"} mono />
                  <Field label="Frequency" value={rs.billing_frequency || "—"} />
                </div>
                {rs.margin_split_warning && (
                  <div style={{ marginTop: 8, color: "#FFB020", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}>
                    {rs.margin_split_warning}
                  </div>
                )}
                {Object.keys(rs.margin_split_json).length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: FG_2, fontFamily: "var(--font-jetbrains-mono)" }}>
                    SPLIT{" "}
                    {Object.entries(rs.margin_split_json)
                      .map(([k, v]) => `${k} ${(Number(v) * 100).toFixed(0)}%`)
                      .join(" • ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 4. Attribution */}
      <Section
        title="Attribution — Who gets credit? Who gets paid?"
        action={
          <button type="button" onClick={onAddAttribution} style={addBtnStyle}>
            + Add Attribution
          </button>
        }
      >
        {detail.attribution.length === 0 ? (
          <div style={{ color: "#FFB020", fontSize: 12, fontFamily: "var(--font-jetbrains-mono)" }}>
            Economics split missing.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {detail.attribution.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                  gap: 10,
                  padding: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 12,
                }}
              >
                <div style={{ color: FG_1 }}>{a.operator_name || a.user_id || "—"}</div>
                <div style={{ color: FG_2, fontFamily: "var(--font-jetbrains-mono)", fontSize: 10, textTransform: "uppercase" }}>
                  {a.role.replace(/_/g, " ")}
                </div>
                <div style={{ color: FG_2, fontFamily: "var(--font-jetbrains-mono)" }}>
                  CREDIT {a.credit_percentage ? `${(a.credit_percentage * 100).toFixed(0)}%` : "—"}
                </div>
                <div style={{ color: FG_1, fontFamily: "var(--font-jetbrains-mono)" }}>
                  ECON {a.economics_percentage ? `${(a.economics_percentage * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 5. Invoice Control */}
      <Section
        title="Invoice Control"
        action={
          <button type="button" onClick={onAddInvoice} style={addBtnStyle}>
            + Add Invoice
          </button>
        }
      >
        {detail.invoices.length === 0 ? (
          <div style={{ color: FG_3, fontSize: 12, fontFamily: "var(--font-jetbrains-mono)" }}>
            No invoices yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {detail.invoices.map((i) => (
              <div
                key={i.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr",
                  gap: 10,
                  padding: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 12,
                  fontFamily: "var(--font-jetbrains-mono)",
                }}
              >
                <div style={{ color: FG_1 }}>{i.invoice_number || `INV ${i.id.slice(0, 6)}`}</div>
                <div style={{ color: FG_1 }}>{fmt(i.amount)}</div>
                <div style={{ color: FG_2 }}>{fmtDate(i.issued_date)}</div>
                <div style={{ color: i.is_overdue ? "#FF3B5C" : FG_2 }}>
                  {i.is_overdue ? `OVERDUE ${i.days_overdue}d` : `due ${fmtDate(i.due_date)}`}
                </div>
                <div
                  style={{
                    color:
                      i.status === "paid"
                        ? "#00E5A0"
                        : i.status === "overdue"
                          ? "#FF3B5C"
                          : "#FFB020",
                    textTransform: "uppercase",
                    fontSize: 10,
                  }}
                >
                  {i.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 6. Proof / Case Study */}
      <Section title="Proof / Case Study Potential">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <Field label="Marketing permission" value={detail.marketing_permission_status.replace(/_/g, " ")} mono />
          <Field label="Current pain" value={detail.current_pain || "—"} />
          <Field label="What Winston replaces" value={detail.what_winston_replaces || "—"} />
          <Field label="Expected ROI angle" value={detail.expected_roi_angle || "—"} />
        </div>
      </Section>

      {/* 7. Timeline */}
      <Section title="Timeline">
        {detail.events.length === 0 ? (
          <div style={{ color: FG_3, fontSize: 12, fontFamily: "var(--font-jetbrains-mono)" }}>
            No events yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {detail.events.slice(0, 12).map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 140px 1fr",
                  gap: 10,
                  padding: 6,
                  fontSize: 11,
                  fontFamily: "var(--font-jetbrains-mono)",
                  color: FG_2,
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <span style={{ color: FG_3 }}>{fmtDate(ev.event_date)}</span>
                <span style={{ color: "#00E5FF", textTransform: "uppercase" }}>{ev.event_type.replace(/_/g, " ")}</span>
                <span style={{ color: FG_1 }}>{ev.summary}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  background: "rgba(0, 229, 255, 0.08)",
  border: "1px solid rgba(0, 229, 255, 0.35)",
  color: "#00E5FF",
  padding: "3px 10px",
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  fontFamily: "var(--font-jetbrains-mono)",
  cursor: "pointer",
};
