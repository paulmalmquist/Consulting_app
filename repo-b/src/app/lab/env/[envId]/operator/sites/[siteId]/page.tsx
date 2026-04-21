"use client";

import { useParams } from "next/navigation";
import { OperatorSiteDetailPage } from "@/components/operator/OperatorPages";

export default function OperatorSiteDetailRoute() {
  const params = useParams();
  const siteId = params.siteId as string;
  return <OperatorSiteDetailPage siteId={siteId} />;
}
