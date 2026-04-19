"use client";

import { Badge, Caps, Dot, RailModule, fmtUSD } from "@/components/operator/command-desk";
import type {
  NvARAging,
  NvAISoftwareSummary,
  NvReceiptIntakeList,
  NvSubscriptionLedgerList,
  NvSubscriptionRow,
} from "@/types/nv-accounting";

type ReceiptIntakeProps = { data: NvReceiptIntakeList | null };

export function ReceiptIntakePanel({ data }: ReceiptIntakeProps) {
  return (
    <RailModule title="RECEIPT INTAKE" accent="var(--neon-cyan)" caption="newest-first">
      {(!data || data.rows.length === 0) ? (
        <div style={{ padding: 12, color: "var(--fg-3)" }}>No intake activity.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.rows.slice(0, 8).map((r, i) => {
            const conf = r.confidence_overall ? Math.round(Number(r.confidence_overall) * 100) : 0;
            const color = conf >= 95 ? "var(--sem-up)" : conf >= 80 ? "var(--neon-cyan)" : "var(--neon-amber)";
            const flag = conf > 0 && conf < 80;
            const vendor = r.vendor_normalized ?? r.merchant_raw ?? r.service_name_guess ?? "—";
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto",
                  gap: 10,
                  padding: "8px 12px",
                  alignItems: "center",
                  borderBottom: i < data.rows.length - 1 ? "1px solid var(--line-1)" : "none",
                  background: flag ? "rgba(255,176,32,.03)" : "transparent",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 36,
                    border: `1px solid ${flag ? "var(--neon-amber)" : "var(--line-3)"}`,
                    background: "var(--bg-inset)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: flag ? "var(--neon-amber)" : "var(--fg-3)",
                    letterSpacing: ".06em",
                  }}
                >
                  {r.source_type.slice(0, 3).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                        color: "var(--fg-1)",
                        fontWeight: 500,
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {vendor}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--fg-1)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.total != null ? fmtUSD(Number(r.total)) : "—"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--fg-3)",
                      marginTop: 2,
                    }}
                  >
                    <span>{r.source_type} · {r.created_at?.slice(11, 16) ?? ""}</span>
                    <span style={{ color }}>{conf || "—"}%{flag ? " · review" : ""}</span>
                  </div>
                </div>
                <span style={{ color: "var(--fg-4)", fontSize: 11 }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </RailModule>
  );
}

type SubscriptionWatchProps = {
  ledger: NvSubscriptionLedgerList | null;
  summary: NvAISoftwareSummary | null;
};

export function SubscriptionWatchPanel({ ledger, summary }: SubscriptionWatchProps) {
  const rows = ledger?.rows ?? [];
  const active = rows.filter((r) => r.is_active);
  const appleOpaque = active.filter(
    (r) => r.billing_platform?.toLowerCase() === "apple" && !r.vendor_normalized,
  );
  const missingDoc = active.filter((r) => !r.documentation_complete);
  return (
    <RailModule title="SUBSCRIPTION WATCH" accent="var(--neon-magenta)" caption={`${active.length} active`}>
      {summary && (
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--line-1)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <SpendBox label="CLAUDE M-T-D" amount={summary.claude_total} color="var(--neon-cyan)" />
          <SpendBox label="OPENAI M-T-D" amount={summary.openai_total} color="var(--neon-violet)" />
          <SpendBox label="APPLE-BILLED M-T-D" amount={summary.apple_billed_total} color="var(--neon-magenta)" />
          <SpendBox label="AMBIGUOUS (REVIEW)" amount={summary.ambiguous_pending_review_usd} color="var(--neon-amber)" />
        </div>
      )}
      {appleOpaque.length > 0 && (
        <SectionRows title="APPLE OPAQUE" tone="warn" rows={appleOpaque} />
      )}
      {missingDoc.length > 0 && (
        <SectionRows title="MISSING SUPPORT" tone="warn" rows={missingDoc} />
      )}
      {active.length > 0 && (
        <SectionRows title="ACTIVE RECURRING" tone="live" rows={active.slice(0, 6)} />
      )}
    </RailModule>
  );
}

function SpendBox({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div>
      <Caps color="var(--fg-3)">{label}</Caps>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          color,
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {fmtUSD(amount)}
      </div>
    </div>
  );
}

function SectionRows({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "warn" | "live";
  rows: NvSubscriptionRow[];
}) {
  return (
    <>
      <div
        style={{
          padding: "8px 12px 4px",
          borderBottom: "1px solid var(--line-1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Caps color={tone === "warn" ? "var(--neon-amber)" : "var(--neon-cyan)"}>
          {title} · {rows.length}
        </Caps>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            padding: "6px 12px",
            borderBottom: "1px solid var(--line-1)",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>
              {r.vendor_normalized ?? r.service_name}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-3)",
                marginTop: 1,
              }}
            >
              {r.service_name} · {r.cadence}
              {r.billing_platform ? ` · ${r.billing_platform}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-1)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {r.expected_amount != null ? fmtUSD(Number(r.expected_amount)) : "—"}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

type RevenueWatchProps = { data: NvARAging | null };

export function RevenueWatchPanel({ data }: RevenueWatchProps) {
  if (!data) {
    return (
      <RailModule title="REVENUE WATCH" accent="var(--sem-up)">
        <div style={{ padding: 12, color: "var(--fg-3)" }}>Loading…</div>
      </RailModule>
    );
  }
  return (
    <RailModule title="REVENUE WATCH" accent="var(--sem-up)" caption={`net ${fmtUSD(data.paid_30d - data.overdue_total)}`}>
      {data.overdue.length > 0 && (
        <>
          <HeaderRow title="OVERDUE" tone="error" total={data.overdue_total} count={data.overdue.length} />
          {data.overdue.map((o, i) => (
            <div
              key={o.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                padding: "6px 12px",
                borderBottom: i < data.overdue.length - 1 ? "1px solid var(--line-1)" : "1px solid var(--line-2)",
                borderLeft: o.days > 0 ? "2px solid var(--sem-error)" : "2px solid transparent",
                background: o.days > 0 ? "rgba(255,31,61,.03)" : "transparent",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>{o.client}</div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: o.days > 0 ? "var(--sem-down)" : "var(--neon-amber)",
                    marginTop: 1,
                  }}
                >
                  {o.invoice_number ?? o.id.slice(0, 8)} · {o.days > 0 ? `overdue ${o.days}d` : "due today"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--fg-1)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtUSD(o.amount)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--neon-cyan)",
                    letterSpacing: ".08em",
                  }}
                >
                  REMIND ›
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      {data.upcoming.length > 0 && (
        <>
          <HeaderRow title="UPCOMING" tone="warn" total={data.upcoming_total} count={data.upcoming.length} />
          {data.upcoming.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                padding: "6px 12px",
                borderBottom: i < data.upcoming.length - 1 ? "1px solid var(--line-1)" : "1px solid var(--line-2)",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>{u.client}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
                  {u.invoice_number ?? u.id.slice(0, 8)} · due {u.due} · {u.days}d
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--fg-1)",
                  fontVariantNumeric: "tabular-nums",
                  alignSelf: "center",
                }}
              >
                {fmtUSD(u.amount)}
              </div>
            </div>
          ))}
        </>
      )}
      {data.payments.length > 0 && (
        <>
          <HeaderRow title="RECENT PAYMENTS" tone="up" total={data.paid_30d} count={data.payments.length} sign="+" />
          {data.payments.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 8,
                padding: "6px 12px",
                borderBottom: i < data.payments.length - 1 ? "1px solid var(--line-1)" : "none",
                alignItems: "center",
              }}
            >
              <Dot color="var(--sem-up)" size={5} />
              <div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>{p.client}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
                  {p.invoice_number ?? p.id.slice(0, 8)} · paid {p.paid_rel} ago
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--sem-up)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                +{fmtUSD(p.amount)}
              </div>
            </div>
          ))}
        </>
      )}
    </RailModule>
  );
}

function HeaderRow({
  title,
  tone,
  total,
  count,
  sign = "",
}: {
  title: string;
  tone: "error" | "warn" | "up";
  total: number;
  count: number;
  sign?: string;
}) {
  const color =
    tone === "error" ? "var(--sem-error)" : tone === "warn" ? "var(--neon-amber)" : "var(--sem-up)";
  const amountColor =
    tone === "error" ? "var(--sem-down)" : tone === "warn" ? "var(--fg-3)" : "var(--sem-up)";
  return (
    <div
      style={{
        padding: "8px 12px 4px",
        borderBottom: "1px solid var(--line-1)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Caps color={color}>
        {title} · {count}
      </Caps>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: amountColor,
          letterSpacing: ".08em",
        }}
      >
        {sign}{fmtUSD(total)}
      </span>
    </div>
  );
}
