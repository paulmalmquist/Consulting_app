"use client";

import { useEffect, useState } from "react";
import { listPdsVendors } from "@/lib/bos-api";
import type { PdsVendor } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US");
}

export default function PdsSubcontractorsPage() {
  const { envId, businessId } = useDomainEnv();
  const [vendors, setVendors] = useState<PdsVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listPdsVendors(envId, businessId || undefined);
        if (!cancelled) setVendors(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load vendors");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId]);

  return (
    <section className="space-y-4" data-testid="pds-subcontractors-page">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
        <h2 className="text-2xl font-semibold">Subcontractors</h2>
        <p className="text-sm text-bm-muted2">Normalized vendor directory backing contracts, submittals, and scorecards.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-bm-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Trade</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Insurance</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-bm-muted2">Loading subcontractors...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-red-300">{error}</td>
              </tr>
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-bm-muted2">No subcontractors have been registered yet.</td>
              </tr>
            ) : (
              vendors.map((vendor) => (
                <tr key={vendor.vendor_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{vendor.vendor_name}</div>
                    <div className="text-xs text-bm-muted2">{vendor.license_number || "No license on file"}</div>
                  </td>
                  <td className="px-4 py-3">{vendor.trade || "—"}</td>
                  <td className="px-4 py-3 text-bm-muted2">
                    {vendor.contact_name || "—"}
                    {vendor.contact_email ? ` · ${vendor.contact_email}` : ""}
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{formatDate(vendor.insurance_expiry)}</td>
                  <td className="px-4 py-3 capitalize">{vendor.status.replace(/_/g, " ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
