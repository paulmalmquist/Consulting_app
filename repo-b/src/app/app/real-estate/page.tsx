"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ReTrust, createReTrust, listReTrusts, seedReDemo } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function RealEstateTrustsPage() {
  const { businessId } = useBusinessContext();
  const [trusts, setTrusts] = useState<ReTrust[]>([]);
  const [name, setName] = useState("Demo Trust A");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!businessId) return;
    const rows = await listReTrusts(businessId);
    setTrusts(rows);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load trusts"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function onCreateTrust(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Creating trust...");
    try {
      await createReTrust({
        business_id: businessId,
        name,
        external_ids: { source: "ui" },
      });
      setStatus("Trust created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trust");
      setStatus("");
    }
  }

  async function onSeed() {
    if (!businessId) return;
    setError(null);
    setStatus("Seeding demo portfolio...");
    try {
      await seedReDemo(businessId);
      setStatus("Seed complete.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed demo data");
      setStatus("");
    }
  }

  return (
    <div className="space-y-6 max-w-6xl" data-testid="re-page">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Real Estate</p>
        <h1 className="text-2xl font-bold">Loan Command Center</h1>
        <p className="text-sm text-bm-muted">
          Trust and portfolio entrypoint for special servicing workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={onCreateTrust} className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Create Trust</h2>
          <input
            data-testid="re-trust-name"
            className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trust name"
          />
          <div className="flex items-center gap-2">
            <button data-testid="re-create-trust" className="bm-btn bm-btn-primary" type="submit">
              Create Trust
            </button>
            <button type="button" className="bm-btn" onClick={onSeed} data-testid="re-seed-demo">
              Seed Demo Data
            </button>
          </div>
          {status && <p className="text-xs text-bm-muted2">{status}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        <section className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Trusts</h2>
          <div className="space-y-2">
            {trusts.length === 0 && <p className="text-sm text-bm-muted2">No trusts yet.</p>}
            {trusts.map((trust) => (
              <Link
                key={trust.trust_id}
                href={`/app/real-estate/trust/${trust.trust_id}`}
                data-testid={`re-trust-${trust.trust_id}`}
                className="block rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2 hover:bg-bm-surface/60"
              >
                <p className="font-medium">{trust.name}</p>
                <p className="text-xs text-bm-muted2">{trust.trust_id}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

