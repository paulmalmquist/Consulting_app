"use client";

import type { ReV2AssetDetail } from "@/lib/bos-api";
import SectionHeader from "../shared/SectionHeader";
import HeroMetricCard from "../shared/HeroMetricCard";
import HorizontalBar from "../shared/HorizontalBar";
import { BRIEFING_COLORS, BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockTenantProfile } from "../mock-data";

interface Props {
  detail: ReV2AssetDetail;
}

export default function TenantProfilePanel({ detail }: Props) {
  const { tenants, walt } = getMockTenantProfile(detail);

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="TENANT PROFILE" title="Tenant & Lease Mix" />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* WALT hero metric */}
        <HeroMetricCard
          label="Weighted Avg Lease Term"
          value={`${walt.toFixed(1)} yrs`}
          accent={BRIEFING_COLORS.performance}
          testId="tenant-walt"
        />

        {/* Top tenants list */}
        <div className="space-y-4 lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Top Tenants by GLA
          </p>
          <div className="space-y-3">
            {tenants.map((t) => (
              <HorizontalBar
                key={t.name}
                label={t.name}
                value={`${t.gla_pct}%`}
                pct={t.gla_pct}
                color={
                  t.name === "Other"
                    ? BRIEFING_COLORS.lineMuted
                    : BRIEFING_COLORS.performance
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
