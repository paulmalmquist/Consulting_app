"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { LeftSidebar } from "@/components/operator/command-desk/layout/LeftSidebar";
import { consultingSidebarSections } from "@/app/lab/env/[envId]/operator/_sidebar";
import { ExecutionBoard } from "@/components/consulting/execution/ExecutionBoard";

const monoLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  fontSize: 12,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "rgba(220,230,240,0.72)",
};

const winstonBrand: ReactNode = (
  <span
    className="font-command"
    style={{
      fontSize: "1rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#ffffff",
      textShadow: "0 0 12px rgba(255,255,255,0.07)",
    }}
  >
    WINSTON
  </span>
);

export default function TasksPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const [reloadKey, setReloadKey] = useState(0);

  const onReload = useCallback(() => setReloadKey((k) => k + 1), []);

  const sections = useMemo(() => consultingSidebarSections(params.envId), [params.envId]);

  return (
    <div
      data-command-desk
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        gridTemplateRows: "52px minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
        background: "#05070B",
      }}
    >
      <LeftSidebar
        mode="brand"
        brand={winstonBrand}
        sections={sections}
        activeKey="tasks"
      />

      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          minWidth: 0,
        }}
      >
        <span style={monoLabel}>Tasks</span>
      </div>

      <LeftSidebar
        mode="nav"
        sections={sections}
        activeKey="tasks"
      />

      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "#dce6f0",
        }}
      >
        {ready && businessId ? (
          <ExecutionBoard
            key={reloadKey}
            envId={params.envId}
            businessId={businessId}
            onReload={onReload}
          />
        ) : (
          <div style={{ padding: 16, fontSize: 13, color: "rgba(220,230,240,0.55)" }}>
            Resolving environment...
          </div>
        )}
      </div>
    </div>
  );
}
