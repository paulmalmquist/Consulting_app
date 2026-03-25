"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ReLoan, createReLoan, listReLoans } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function RealEstateTrustDetailPage({ params }: { params: { trustId: string } }) {
  const trustId = params.trustId;
  const { businessId } = useBusinessContext();
  const [loans, setLoans] = useState<ReLoan[]>([]);
  const [identifier, setIdentifier] = useState(`LOAN-${Date.now().toString().slice(-5)}`);
  const [currentBalance, setCurrentBalance] = useState("2200000000");
  const [rate, setRate] = useState("0.0675");
  const [maturity, setMaturity] = useState("2028-12-31");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!businessId) return;
    const rows = await listReLoans(businessId, trustId);
    setLoans(rows);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load loans"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, trustId]);

  async function onCreateLoan(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Creating loan...");
    try {
      await createReLoan({
        business_id: businessId,
        trust_id: trustId,
        loan_identifier: identifier,
        original_balance_cents: Number(currentBalance),
        current_balance_cents: Number(currentBalance),
        rate_decimal: Number(rate),
        maturity_date: maturity,
        servicer_status: "watchlist",
        borrowers: [{ name: "Default Borrower LLC", sponsor: "Default Sponsor" }],
        properties: [{ address_line1: "100 Main St", city: "Dallas", state: "TX", postal_code: "75201", property_type: "multifamily", square_feet: 155000, unit_count: 240 }],
      });
      setStatus("Loan created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create loan");
      setStatus("");
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Real Estate</p>
        <h1 className="text-2xl font-bold">Trust Portfolio</h1>
        <p className="text-sm text-bm-muted2">{trustId}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={onCreateLoan} className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Create Loan</h2>
          <input data-testid="re-loan-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" placeholder="Loan identifier" />
          <input data-testid="re-loan-balance" value={currentBalance} onChange={(e) => setCurrentBalance(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" placeholder="Current balance cents" />
          <input data-testid="re-loan-rate" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" placeholder="Rate decimal" />
          <input data-testid="re-loan-maturity" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <button data-testid="re-create-loan" className="bm-btn bm-btn-primary" type="submit">Create Loan</button>
          {status && <p className="text-xs text-bm-muted2">{status}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        <section className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Loans</h2>
          <div className="space-y-2">
            {loans.length === 0 && <p className="text-sm text-bm-muted2">No loans yet.</p>}
            {loans.map((loan) => (
              <Link
                key={loan.loan_id}
                href={`/app/real-estate/loan/${loan.loan_id}`}
                data-testid={`re-loan-${loan.loan_id}`}
                className="block rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2 hover:bg-bm-surface/60"
              >
                <p className="font-medium">{loan.loan_identifier}</p>
                <p className="text-xs text-bm-muted2">Balance ${(loan.current_balance_cents / 100).toLocaleString()}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

