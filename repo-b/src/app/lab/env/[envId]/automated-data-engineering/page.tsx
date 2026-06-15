"use client";

import { use } from "react";
import AdeOverview from "@/components/automated-data-engineering/AdeOverview";

export default function AdeOverviewPage({ params }: { params: Promise<{ envId: string }> }) {
  const { envId } = use(params);
  return <AdeOverview envId={envId} />;
}
