"use client";

import type { ReV2AssetDetail } from "@/lib/bos-api";
import { PROPERTY_TYPE_LABELS, label } from "@/lib/labels";
import { fmtMoney, fmtPct, fmtText } from "./format-utils";

interface Props {
  property: ReV2AssetDetail["property"];
}

export default function SectorCapacityCard({ property }: Props) {
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
        {label(PROPERTY_TYPE_LABELS, property.property_type ?? "")} Capacity
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
