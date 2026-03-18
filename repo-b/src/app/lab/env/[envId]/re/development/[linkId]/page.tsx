"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { DevExecutionPanel } from "@/components/repe/development/DevExecutionPanel";
import { DevAssumptionPanel } from "@/components/repe/development/DevAssumptionPanel";
import { DevFundImpactCard } from "@/components/repe/development/DevFundImpactCard";
import {
  getDevProjectDetail,
  getDevFundImpact,
  type DevProjectDetailResponse,
  type DevFundImpactResponse,
} from "@/lib/bos-api";

export default function DevProjectDetailPage() {
  const params = useParams();
  const linkId = params.linkId as string;
  const { envId } = useReEnv();

  const [detail, setDetail] = useState<DevProjectDetailResponse | null>(null);
  const [fundImpact, setFundImpact] = useState<DevFundImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!envId || !linkId) return;
    setLoading(true);
    Promise.all([
      getDevProjectDetail(linkId, envId),
      getDevFundImpact(linkId).catch(() => null),
    ])
      .then(([detailRes, fundRes]) => {
        setDetail(detailRes);
        setFundImpact(fundRes);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load project detail");
      })
      .finally(() => setLoading(false));
  }, [envId, linkId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex h-8 items-center gap-2">
          <Link
            href={`/lab/env/${envId}/re/development`}
            className="text-xs text-bm-muted2 hover:text-bm-text"
          >
            Development
          </Link>
          <span className="text-xs text-bm-muted2">/</span>
          <span className="text-xs text-bm-muted2">Loading...</span>
        </div>
        <div className="flex h-60 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-bm-border border-t-indigo-500" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link
          href={`/lab/env/${envId}/re/development`}
          className="text-xs text-bm-muted2 hover:text-bm-text"
        >
          &larr; Back to Development
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-8 text-center">
          <p className="text-sm text-red-400">{error ?? "Project not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/lab/env/${envId}/re/development`}
          className="text-xs text-bm-muted2 hover:text-bm-text"
        >
          Development
        </Link>
        <span className="text-xs text-bm-muted2">/</span>
        <span className="text-xs font-medium text-bm-text">
          {detail.pds_execution.project_name}
        </span>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-bm-text">
          {detail.pds_execution.project_name}
        </h1>
        <p className="mt-1 text-sm text-bm-muted2">
          {detail.asset.name} &middot; {detail.asset.property_type} &middot; {detail.asset.market}
        </p>
      </div>

      {/* Three-panel layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: PDS Execution */}
        <DevExecutionPanel
          execution={detail.pds_execution}
          asset={detail.asset}
        />

        {/* Center: Assumptions */}
        <DevAssumptionPanel
          assumptions={detail.assumptions}
          linkId={linkId}
          onRefresh={fetchData}
        />

        {/* Right: Fund Impact */}
        <DevFundImpactCard data={fundImpact} />
      </div>
    </div>
  );
}
