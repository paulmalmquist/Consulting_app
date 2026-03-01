"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRepeContext } from "@/lib/repe-context";

export default function ReInvestmentDetailPage({
  params,
}: {
  params: { dealId: string };
}) {
  const { environmentId } = useRepeContext();
  const router = useRouter();

  useEffect(() => {
    if (environmentId) {
      router.replace(
        `/lab/env/${environmentId}/re/investments/${params.dealId}`,
      );
    }
  }, [environmentId, params.dealId, router]);

  if (!environmentId) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-sm text-bm-muted2">
        Environment context is required. Please navigate from the RE workspace.
      </div>
    );
  }

  return (
    <div className="p-6 text-sm text-bm-muted2">
      Redirecting to investment cockpit...
    </div>
  );
}
