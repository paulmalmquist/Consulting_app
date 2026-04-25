"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { fetchExecutionBoard, type ExecutionCard } from "@/lib/cro-api";
import { LeftSidebar } from "@/components/operator/command-desk";
import { consultingSidebarSections } from "../../../operator/_sidebar";

function fmtUSD(n: number | null | undefined): string {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function relDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export default function LostDealsPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";
  const { businessId, ready } = useConsultingEnv();
  const [lostCards, setLostCards] = useState<ExecutionCard[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !businessId) return;
    fetchExecutionBoard(envId, businessId)
      .then((board) => {
        const lost = board.columns
          .filter((c) => c.execution_column_key === "closed_lost")
          .flatMap((c) => c.cards);
        setLostCards(lost);
      })
      .catch(() => setLostCards([]))
      .finally(() => setLoading(false));
  }, [envId, businessId, ready]);

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, background: "#05070B" }}>
      <LeftSidebar
        sections={consultingSidebarSections(envId)}
        activeKey="pipeline"
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "24px 28px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <Link
              href={`/lab/env/${envId}/consulting/pipeline`}
              style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(220,230,240,0.45)", textDecoration: "none", letterSpacing: ".06em" }}
            >
              ← PIPELINE
            </Link>
          </div>
          <h1 style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 600, color: "rgba(220,230,240,0.90)", letterSpacing: ".04em", margin: 0 }}>
            LOST DEALS
          </h1>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(220,230,240,0.42)", marginTop: 6, letterSpacing: ".04em" }}>
            Closed-lost opportunities. Use this to track lessons, identify recycle candidates, and measure loss patterns.
          </p>
        </div>

        {loading ? (
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(220,230,240,0.40)" }}>Loading…</div>
        ) : !lostCards || lostCards.length === 0 ? (
          <div style={{
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.02)",
            padding: "32px 24px",
            fontFamily: "monospace",
            fontSize: 13,
            color: "rgba(220,230,240,0.45)",
            textAlign: "center",
          }}>
            No closed-lost deals on record.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 120px 140px 120px",
              gap: 12,
              padding: "6px 14px",
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: ".10em",
              textTransform: "uppercase",
              color: "rgba(220,230,240,0.35)",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              <span>Company</span>
              <span style={{ textAlign: "right" }}>Value</span>
              <span>Last Stage</span>
              <span>Lost</span>
              <span>Loss Reason</span>
            </div>

            {lostCards.map((card) => (
              <div
                key={card.crm_opportunity_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 120px 140px 120px",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ color: "rgba(220,230,240,0.85)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {card.account_name}
                  </div>
                  {card.industry ? (
                    <div style={{ fontSize: 10, color: "rgba(220,230,240,0.35)", marginTop: 2 }}>{card.industry}</div>
                  ) : null}
                </div>
                <div style={{ textAlign: "right", color: "rgba(220,230,240,0.65)", alignSelf: "center" }}>
                  {fmtUSD(card.amount)}
                </div>
                <div style={{ color: "rgba(220,230,240,0.45)", alignSelf: "center", fontSize: 11 }}>
                  {card.stage_key ?? "—"}
                </div>
                <div style={{ color: "rgba(220,230,240,0.42)", alignSelf: "center", fontSize: 11 }}>
                  {relDate(card.last_activity_at)}
                </div>
                <div style={{ color: "rgba(239,68,68,0.65)", alignSelf: "center", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {card.next_action_description ?? "—"}
                </div>
              </div>
            ))}

            <div style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: "rgba(220,230,240,0.30)" }}>
              {lostCards.length} deal{lostCards.length !== 1 ? "s" : ""} · total value lost:{" "}
              {fmtUSD(lostCards.reduce((s, c) => s + (c.amount || 0), 0))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
