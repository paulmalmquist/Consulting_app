"use client";

import { useParams } from "next/navigation";
import AdeOverview from "@/components/automated-data-engineering/AdeOverview";

export default function AdeOverviewPage() {
  const { envId } = useParams<{ envId: string }>();
  return <AdeOverview envId={envId} />;
}
