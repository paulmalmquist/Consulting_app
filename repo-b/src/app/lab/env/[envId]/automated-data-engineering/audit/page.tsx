"use client";

import { useParams } from "next/navigation";
import AuditDashboard from "@/components/automated-data-engineering/AuditDashboard";

export default function AdeAuditPage() {
  const { envId } = useParams<{ envId: string }>();
  return <AuditDashboard envId={envId} />;
}
