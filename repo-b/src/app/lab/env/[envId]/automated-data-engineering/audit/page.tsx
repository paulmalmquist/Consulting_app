"use client";

import { use } from "react";
import AuditDashboard from "@/components/automated-data-engineering/AuditDashboard";

export default function AdeAuditPage({ params }: { params: Promise<{ envId: string }> }) {
  const { envId } = use(params);
  return <AuditDashboard envId={envId} />;
}
