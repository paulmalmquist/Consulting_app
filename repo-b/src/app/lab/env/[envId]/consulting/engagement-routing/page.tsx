"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import EngagementRoutingBoard from "@/components/consulting/engagement-routing/EngagementRoutingBoard";

export default function EngagementRoutingPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";
  const { businessId, loading, error } = useConsultingEnv();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#05070B", color: "#A9B4C4", fontFamily: "var(--font-jetbrains-mono)" }}>
        Loading consulting environment…
      </div>
    );
  }

  if (error || !businessId) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#05070B", color: "#FF3B5C", fontFamily: "var(--font-jetbrains-mono)" }}>
        {error || "No business id resolved"}
      </div>
    );
  }

  return <EngagementRoutingBoard envId={envId} businessId={businessId} />;
}
