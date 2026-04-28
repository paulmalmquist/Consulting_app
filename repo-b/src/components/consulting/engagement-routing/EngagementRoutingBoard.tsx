"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addRoutingAttribution,
  addRoutingContract,
  addRoutingInvoice,
  addRoutingRevenueStream,
  convertEngagementToNovendor,
  createRoutingEngagement,
  fetchRoutingDashboard,
  fetchRoutingEngagementDetail,
  fetchRoutingEngagements,
  type RoutingDashboard,
  type RoutingEngagementDetail,
  type RoutingEngagementListItem,
} from "@/lib/cro-api";
import { EngagementCard } from "./EngagementCard";
import { EngagementDetailColumn } from "./EngagementDetailColumn";
import { RoutingHealthRail } from "./RoutingHealthRail";
import {
  AttributionDrawer,
  ContractDrawer,
  EngagementCreateDrawer,
  InvoiceDrawer,
  RevenueStreamDrawer,
} from "./Drawers";

const FG_1 = "#E6EDF7";
const FG_2 = "#A9B4C4";
const FG_3 = "#6B7891";
const BORDER = "rgba(105, 120, 145, 0.18)";
const BG_VOID = "#05070B";
const BG_BASE = "#0A0E14";

type HealthFilter = "all" | "green" | "yellow" | "red";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: "10px 14px", borderRight: `1px solid ${BORDER}`, minWidth: 140 }}>
      <div
        style={{
          fontSize: 9,
          color: FG_3,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontFamily: "var(--font-jetbrains-mono)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          marginTop: 2,
          color: accent ?? FG_1,
          fontFamily: "var(--font-jetbrains-mono)",
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const sidebarBtn: React.CSSProperties = {
  display: "block",
  padding: "10px 14px",
  fontSize: 11,
  color: FG_2,
  textDecoration: "none",
  borderLeft: "2px solid transparent",
  fontFamily: "var(--font-jetbrains-mono)",
  letterSpacing: "0.04em",
};

export default function EngagementRoutingBoard({ envId, businessId }: { envId: string; businessId: string }) {
  const [items, setItems] = useState<RoutingEngagementListItem[]>([]);
  const [dashboard, setDashboard] = useState<RoutingDashboard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoutingEngagementDetail | null>(null);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState<null | "engagement" | "contract" | "revenue" | "invoice" | "attribution">(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [list, dash] = await Promise.all([
        fetchRoutingEngagements({
          envId,
          businessId,
          routing_health_status: healthFilter === "all" ? undefined : healthFilter,
          search: search || undefined,
          limit: 200,
        }),
        fetchRoutingDashboard({ envId, businessId }),
      ]);
      setItems(list.items);
      setDashboard(dash);
      if (!selectedId && list.items.length > 0) {
        setSelectedId(list.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load engagements");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, healthFilter, search, selectedId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    fetchRoutingEngagementDetail({ envId, businessId, engagementId: selectedId })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load detail");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, envId, businessId]);

  const sortedItems = useMemo(() => {
    const order = { red: 0, yellow: 1, green: 2 } as const;
    return [...items].sort((a, b) => {
      const aOrder = order[a.routing_health.routing_health_status];
      const bOrder = order[b.routing_health.routing_health_status];
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aOver =
        a.next_action_due_date != null && new Date(a.next_action_due_date) < new Date(new Date().toDateString());
      const bOver =
        b.next_action_due_date != null && new Date(b.next_action_due_date) < new Date(new Date().toDateString());
      if (aOver !== bOver) return aOver ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items]);

  async function refreshDetail() {
    if (!selectedId) return;
    const d = await fetchRoutingEngagementDetail({ envId, businessId, engagementId: selectedId });
    setDetail(d);
    void reload();
  }

  async function handleCreateEngagement(payload: Record<string, unknown>) {
    const created = await createRoutingEngagement({ envId, businessId, payload: payload as Parameters<typeof createRoutingEngagement>[0]["payload"] });
    setSelectedId(created.engagement.id);
    void reload();
  }

  async function handleAddContract(payload: Record<string, unknown>) {
    if (!selectedId) return;
    await addRoutingContract({
      envId,
      businessId,
      engagementId: selectedId,
      payload: payload as Parameters<typeof addRoutingContract>[0]["payload"],
    });
    void refreshDetail();
  }

  async function handleAddRevenueStream(payload: Record<string, unknown>) {
    if (!selectedId) return;
    await addRoutingRevenueStream({
      envId,
      businessId,
      engagementId: selectedId,
      payload: payload as Parameters<typeof addRoutingRevenueStream>[0]["payload"],
    });
    void refreshDetail();
  }

  async function handleAddInvoice(payload: Record<string, unknown>) {
    if (!selectedId) return;
    await addRoutingInvoice({
      envId,
      businessId,
      engagementId: selectedId,
      payload: payload as Parameters<typeof addRoutingInvoice>[0]["payload"],
    });
    void refreshDetail();
  }

  async function handleAddAttribution(payload: Record<string, unknown>) {
    if (!selectedId) return;
    await addRoutingAttribution({
      envId,
      businessId,
      engagementId: selectedId,
      payload: payload as Parameters<typeof addRoutingAttribution>[0]["payload"],
    });
    void refreshDetail();
  }

  async function handleConvertToNovendor() {
    if (!selectedId) return;
    await convertEngagementToNovendor({ envId, businessId, engagementId: selectedId });
    void refreshDetail();
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 360px 1fr 380px",
        gridTemplateRows: "56px 1fr",
        height: "100vh",
        minHeight: "100vh",
        background: BG_VOID,
        color: FG_1,
        fontFamily: "var(--font-plex-sans)",
        overflow: "hidden",
      }}
    >
      {/* Left sidebar */}
      <aside
        style={{
          gridRow: "1 / span 2",
          background: BG_BASE,
          borderRight: `1px solid ${BORDER}`,
          padding: "12px 0",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 14px 12px", borderBottom: `1px solid ${BORDER}` }}>
          <div
            style={{
              fontSize: 9,
              color: FG_3,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "var(--font-jetbrains-mono)",
            }}
          >
            Novendor
          </div>
          <div style={{ fontSize: 13, color: FG_1, marginTop: 2, fontWeight: 600 }}>Consulting Engine</div>
        </div>
        <nav style={{ marginTop: 8 }}>
          {[
            ["Pipeline", "/pipeline"],
            ["Execution", "/execution"],
            ["Engagement Routing", "/engagement-routing", true],
            ["Accounts", "/accounts"],
            ["Contacts", "/contacts"],
            ["Outreach", "/strategic-outreach"],
            ["Proposals", "/proposals"],
            ["Clients", "/clients"],
            ["Revenue", "/revenue"],
          ].map(([label, path, active]) => (
            <Link
              key={label as string}
              href={`/lab/env/${envId}/consulting${path}`}
              style={{
                ...sidebarBtn,
                color: active ? "#00E5FF" : FG_2,
                background: active ? "rgba(0,229,255,0.05)" : "transparent",
                borderLeftColor: active ? "#00E5FF" : "transparent",
              }}
            >
              {label as string}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Top band */}
      <header
        style={{
          gridColumn: "2 / span 3",
          background: BG_BASE,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "stretch",
          paddingRight: 16,
        }}
      >
        <div style={{ padding: "10px 16px", borderRight: `1px solid ${BORDER}`, minWidth: 280 }}>
          <div style={{ fontSize: 9, color: FG_3, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "var(--font-jetbrains-mono)" }}>
            Engagement Routing
          </div>
          <div style={{ fontSize: 13, color: FG_1, marginTop: 2 }}>Control how work becomes Novendor revenue.</div>
        </div>

        {dashboard && (
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <KPI label="Routed Revenue" value={fmt(dashboard.total_contract_value)} />
            <KPI label="Collected" value={fmt(dashboard.total_collected)} accent="#00E5A0" />
            <KPI label="Outstanding" value={fmt(dashboard.total_outstanding)} accent={dashboard.total_outstanding > 0 ? "#FFB020" : undefined} />
            <KPI label="Personal / Non-Comp" value={fmt(dashboard.non_compounding_revenue_amount)} accent={dashboard.non_compounding_revenue_amount > 0 ? "#FF3B5C" : undefined} />
            <KPI label="Routing Health" value={`${dashboard.percent_properly_routed.toFixed(0)}%`} accent={dashboard.percent_properly_routed >= 80 ? "#00E5A0" : dashboard.percent_properly_routed >= 50 ? "#FFB020" : "#FF3B5C"} />
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setDrawerOpen("engagement")}
            style={{
              background: "#00E5FF",
              color: "#05070B",
              border: "none",
              padding: "8px 14px",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-jetbrains-mono)",
            }}
          >
            + New Engagement
          </button>
        </div>
      </header>

      {/* Left list column */}
      <div
        style={{
          background: BG_BASE,
          borderRight: `1px solid ${BORDER}`,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 12px",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {(["all", "red", "yellow", "green"] as HealthFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setHealthFilter(f)}
              style={{
                padding: "4px 10px",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                background: healthFilter === f ? "rgba(0,229,255,0.08)" : "transparent",
                border: `1px solid ${healthFilter === f ? "rgba(0,229,255,0.4)" : BORDER}`,
                color: healthFilter === f ? "#00E5FF" : FG_2,
                cursor: "pointer",
                fontFamily: "var(--font-jetbrains-mono)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BORDER}` }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, engagement, notes…"
            style={{
              width: "100%",
              background: BG_VOID,
              border: `1px solid ${BORDER}`,
              color: FG_1,
              padding: "6px 10px",
              fontSize: 12,
              fontFamily: "var(--font-plex-sans)",
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div style={{ padding: 16, color: FG_3, fontFamily: "var(--font-jetbrains-mono)", fontSize: 11 }}>
              Loading engagements…
            </div>
          ) : sortedItems.length === 0 ? (
            <div style={{ padding: 24, color: FG_2, fontSize: 13, fontFamily: "var(--font-plex-sans)", textAlign: "center" }}>
              <div style={{ marginBottom: 8 }}>No routed engagements yet.</div>
              <div style={{ color: FG_3, fontSize: 12 }}>Convert a won deal or create the first Novendor engagement.</div>
            </div>
          ) : (
            sortedItems.map((it) => (
              <EngagementCard
                key={it.id}
                item={it}
                isActive={selectedId === it.id}
                onClick={() => setSelectedId(it.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Center detail */}
      <main style={{ minHeight: 0, overflow: "hidden", background: BG_VOID }}>
        {error && (
          <div style={{ padding: 16, color: "#FF3B5C", fontFamily: "var(--font-jetbrains-mono)", fontSize: 12 }}>
            {error}
          </div>
        )}
        {detail ? (
          <EngagementDetailColumn
            detail={detail}
            onConvertToNovendor={handleConvertToNovendor}
            onAddContract={() => setDrawerOpen("contract")}
            onAddRevenueStream={() => setDrawerOpen("revenue")}
            onAddInvoice={() => setDrawerOpen("invoice")}
            onAddAttribution={() => setDrawerOpen("attribution")}
          />
        ) : !loading ? (
          <div style={{ padding: 32, color: FG_3, fontSize: 12, fontFamily: "var(--font-jetbrains-mono)" }}>
            Select an engagement to inspect routing.
          </div>
        ) : null}
      </main>

      {/* Right rail */}
      <div style={{ minHeight: 0, overflow: "hidden" }}>
        {detail ? (
          <RoutingHealthRail detail={detail} />
        ) : (
          <div
            style={{
              padding: 16,
              background: BG_BASE,
              borderLeft: `1px solid ${BORDER}`,
              height: "100%",
              color: FG_3,
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
            }}
          >
            Routing health will appear here.
          </div>
        )}
      </div>

      {/* Drawers */}
      {drawerOpen === "engagement" && (
        <EngagementCreateDrawer onClose={() => setDrawerOpen(null)} onSubmit={handleCreateEngagement} />
      )}
      {drawerOpen === "contract" && (
        <ContractDrawer onClose={() => setDrawerOpen(null)} onSubmit={handleAddContract} />
      )}
      {drawerOpen === "revenue" && (
        <RevenueStreamDrawer onClose={() => setDrawerOpen(null)} onSubmit={handleAddRevenueStream} />
      )}
      {drawerOpen === "invoice" && (
        <InvoiceDrawer onClose={() => setDrawerOpen(null)} onSubmit={handleAddInvoice} />
      )}
      {drawerOpen === "attribution" && (
        <AttributionDrawer onClose={() => setDrawerOpen(null)} onSubmit={handleAddAttribution} />
      )}
    </div>
  );
}
