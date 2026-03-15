"use client";

import type { ReV2AssetDetail, ReLeaseTenant } from "@/lib/bos-api";
import SectionHeader from "../shared/SectionHeader";
import HeroMetricCard from "../shared/HeroMetricCard";
import HorizontalBar from "../shared/HorizontalBar";
import { BRIEFING_COLORS, BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockTenantProfile } from "../mock-data";

interface Props {
  detail: ReV2AssetDetail;
  /** Real tenant data from /leasing/tenants API. When provided, overrides mock. */
  realTenants?: ReLeaseTenant[];
  realWalt?: number | null;
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

export default function TenantProfilePanel({ detail, realTenants, realWalt }: Props) {
  const useReal = realTenants && realTenants.length > 0;
  const mock = useReal ? null : getMockTenantProfile(detail);
  const tenants = useReal
    ? realTenants.map((t) => ({ name: t.name, gla_pct: t.gla_pct, lease_end: new Date(t.expiration_date).getFullYear().toString(), is_anchor: t.is_anchor }))
    : (mock?.tenants ?? []).map((t) => ({ ...t, is_anchor: false }));
  const walt = useReal ? (realWalt ?? 0) : (mock?.walt ?? 0);

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
              <div key={t.name} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <HorizontalBar
                    label={t.name}
                    value={`${t.gla_pct}%`}
                    pct={t.gla_pct}
                    color={
                      t.name === "Other"
                        ? BRIEFING_COLORS.lineMuted
                        : BRIEFING_COLORS.performance
                    }
                  />
                </div>
                {t.is_anchor && (
                  <Pill label="Anchor" className="shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
