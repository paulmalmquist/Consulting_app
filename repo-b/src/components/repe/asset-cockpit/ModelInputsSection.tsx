"use client";

import Link from "next/link";
import type { ReV2AssetDetail, ReV2AssetQuarterState, ReV2Scenario } from "@/lib/bos-api";
import ValuationLeverPanel from "@/components/repe/ValuationLeverPanel";

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString() : "—";
  return String(v);
}

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

interface Props {
  detail: ReV2AssetDetail;
  financialState: ReV2AssetQuarterState | null;
  scenarios: ReV2Scenario[];
  quarter: string;
  sustainabilityHref: string;
}

function SectorCapacityCard({ property }: { property: ReV2AssetDetail["property"] }) {
  const pt = (property.property_type ?? "").toLowerCase();
  if (!pt) return null;

  const rows: Array<{ label: string; value: string }> = [];

  if (pt === "multifamily") {
    rows.push({ label: "Units", value: fmtText(property.units) });
    rows.push({ label: "Avg Rent / Unit", value: property.avg_rent_per_unit != null ? fmtMoney(property.avg_rent_per_unit) : "—" });
  }

  if (pt === "senior_housing" || pt === "senior housing") {
    rows.push({ label: "Beds", value: fmtText(property.beds) });
    rows.push({ label: "Licensed Beds", value: fmtText(property.licensed_beds) });
    rows.push({ label: "Rev / Occupied Bed", value: property.revenue_per_occupied_bed != null ? fmtMoney(property.revenue_per_occupied_bed) : "—" });
  }

  if (pt === "student_housing" || pt === "student housing") {
    rows.push({ label: "Beds", value: fmtText(property.beds_student) });
    rows.push({ label: "Pre-Leased", value: property.preleased_pct != null ? fmtPct(property.preleased_pct) : "—" });
    rows.push({ label: "University", value: fmtText(property.university_name) });
  }

  if (pt === "medical_office" || pt === "medical office" || pt === "mob") {
    rows.push({ label: "Leasable SF", value: property.leasable_sf != null ? `${(Number(property.leasable_sf) / 1000).toFixed(0)}K` : "—" });
    rows.push({ label: "Leased SF", value: property.leased_sf != null ? `${(Number(property.leased_sf) / 1000).toFixed(0)}K` : "—" });
    rows.push({ label: "WALT (yrs)", value: property.walt_years != null ? `${Number(property.walt_years).toFixed(1)}` : "—" });
    rows.push({ label: "Anchor Tenant", value: fmtText(property.anchor_tenant) });
    rows.push({ label: "Health System", value: fmtText(property.health_system_affiliation) });
  }

  if (pt === "industrial") {
    rows.push({ label: "Warehouse SF", value: property.warehouse_sf != null ? `${(Number(property.warehouse_sf) / 1000).toFixed(0)}K` : "—" });
    rows.push({ label: "Office SF", value: property.office_sf != null ? `${(Number(property.office_sf) / 1000).toFixed(0)}K` : "—" });
    rows.push({ label: "Clear Height", value: property.clear_height_ft != null ? `${Number(property.clear_height_ft).toFixed(0)} ft` : "—" });
    rows.push({ label: "Dock Doors", value: fmtText(property.dock_doors) });
    rows.push({ label: "Rail Served", value: property.rail_served != null ? (property.rail_served ? "Yes" : "No") : "—" });
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
        {property.property_type} Capacity
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-xs text-bm-muted2">{r.label}</dt>
            <dd className="font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ModelInputsSection({
  detail,
  financialState,
  scenarios,
  quarter,
  sustainabilityHref,
}: Props) {
  const { asset, property } = detail;

  return (
    <div className="space-y-4" data-testid="asset-model-inputs-section">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Valuation Lever Panel */}
        <ValuationLeverPanel
          assetId={asset.asset_id}
          quarter={quarter}
          propertyType={property.property_type}
          scenarios={scenarios.map((s) => ({ id: s.scenario_id, name: s.name }))}
        />

        {/* Right: Sector Capacity + Debt Summary */}
        <div className="space-y-4">
          <SectorCapacityCard property={property} />

          {/* Property Details */}
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
              Property Details
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-bm-muted2">Property Type</dt><dd className="font-medium">{fmtText(property.property_type)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Market</dt><dd className="font-medium">{fmtText(property.market)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">City / State</dt><dd className="font-medium">{property.city ? `${property.city}, ${property.state}` : "—"}</dd></div>
              <div><dt className="text-xs text-bm-muted2">MSA</dt><dd className="font-medium">{fmtText(property.msa)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Square Feet</dt><dd className="font-medium">{property.square_feet ? `${(Number(property.square_feet) / 1000).toFixed(0)}K SF` : "—"}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Year Built</dt><dd className="font-medium">{fmtText(property.year_built)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Cost Basis</dt><dd className="font-medium">{fmtMoney(asset.cost_basis)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Status</dt><dd className="font-medium">{asset.status}</dd></div>
            </dl>
          </div>

          {/* Debt Summary Card */}
          {financialState && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
                Debt Summary
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-bm-muted2">Debt Balance</dt><dd className="font-medium">{fmtMoney(financialState.debt_balance)}</dd></div>
                <div><dt className="text-xs text-bm-muted2">Debt Service</dt><dd className="font-medium">{fmtMoney(financialState.debt_service)}</dd></div>
                <div><dt className="text-xs text-bm-muted2">LTV</dt><dd className="font-medium">{fmtPct(financialState.ltv)}</dd></div>
                <div><dt className="text-xs text-bm-muted2">DSCR</dt><dd className="font-medium">{fmtX(financialState.dscr)}</dd></div>
              </dl>
            </div>
          )}

          {/* Sustainability Link */}
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
              Sustainability
            </h3>
            <p className="mt-2 text-sm text-bm-muted2">
              Access utility, emissions, and certification analytics for this asset.
            </p>
            <Link
              href={sustainabilityHref}
              className="mt-3 inline-block rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90"
            >
              Open Sustainability Module
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
