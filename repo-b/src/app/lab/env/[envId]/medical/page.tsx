"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createMedOfficeProperty, listMedOfficeProperties, MedOfficeProperty } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function MedicalBackofficePage() {
  const { envId, businessId } = useDomainEnv();
  const [properties, setProperties] = useState<MedOfficeProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ property_name: "", market: "" });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listMedOfficeProperties(envId, businessId || undefined);
      setProperties(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load properties");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function onCreateProperty(event: FormEvent) {
    event.preventDefault();
    setStatus("Creating property...");
    setError(null);
    try {
      await createMedOfficeProperty({
        env_id: envId,
        business_id: businessId || undefined,
        property_name: form.property_name,
        market: form.market || undefined,
      });
      setForm({ property_name: "", market: "" });
      await refresh();
      setStatus("Property created.");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to create property");
    }
  }

  return (
    <section className="space-y-5" data-testid="medical-backoffice">
      <div>
        <h2 className="text-2xl font-semibold">Medical Office Backoffice</h2>
        <p className="text-sm text-bm-muted2">Tenant CRM, lease revenue, compliance, work orders, vendor, and capex controls.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Properties</p>
          <p className="mt-1 text-xl font-semibold">{properties.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Active</p>
          <p className="mt-1 text-xl font-semibold">{properties.filter((row) => row.status === "active").length}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,320px] gap-4">
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {loading ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={3}>Loading properties...</td></tr>
              ) : properties.length === 0 ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={3}>No properties yet.</td></tr>
              ) : (
                properties.map((property) => (
                  <tr key={property.property_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium"><Link href={`/lab/env/${envId}/medical/properties/${property.property_id}`} className="hover:underline">{property.property_name}</Link></td>
                    <td className="px-4 py-3">{property.market || "—"}</td>
                    <td className="px-4 py-3 capitalize">{property.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Add Property</h3>
          <form className="space-y-2" onSubmit={onCreateProperty}>
            <input required value={form.property_name} onChange={(e) => setForm((prev) => ({ ...prev, property_name: e.target.value }))} placeholder="Property name" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.market} onChange={(e) => setForm((prev) => ({ ...prev, market: e.target.value }))} placeholder="Market" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <button type="submit" className="w-full rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Create Property</button>
          </form>
          {status ? <p className="mt-2 text-xs text-bm-muted2">{status}</p> : null}
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
