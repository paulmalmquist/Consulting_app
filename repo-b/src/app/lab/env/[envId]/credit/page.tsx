"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  listCreditPortfolios,
  getCreditSnapshot,
  seedCreditDemo,
  listCreditCases,
  createCreditCase,
  CreditCase,
  CreditPortfolio,
  CreditEnvironmentSnapshot,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { fmtMoney, fmtPct } from '@/lib/format-utils';
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

type Tab = "portfolio" | "origination";

export default function CreditHubPage() {
  const { envId, businessId } = useDomainEnv();
  const [tab, setTab] = useState<Tab>("portfolio");

  // Portfolio Analytics state
  const [portfolios, setPortfolios] = useState<CreditPortfolio[]>([]);
  const [snapshot, setSnapshot] = useState<CreditEnvironmentSnapshot | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Origination state
  const [cases, setCases] = useState<CreditCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [form, setForm] = useState({
    case_number: "",
    borrower_name: "",
    facility_type: "term_loan",
    requested_amount: "",
    risk_grade: "",
  });

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit`,
      surface: "credit",
      active_module: "credit",
    });
    return () => resetAssistantPageContext();
  }, [envId]);

  async function refreshPortfolio() {
    setPortfolioLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        listCreditPortfolios(envId, businessId || undefined),
        getCreditSnapshot(envId, businessId || undefined),
      ]);
      setPortfolios(p);
      setSnapshot(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio data");
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function refreshCases() {
    setCasesLoading(true);
    setError(null);
    try {
      const rows = await listCreditCases(envId, businessId || undefined);
      setCases(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credit cases");
    } finally {
      setCasesLoading(false);
    }
  }

  useEffect(() => {
    void refreshPortfolio();
    void refreshCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function onSeedDemo() {
    setSeeding(true);
    setError(null);
    try {
      await seedCreditDemo(envId, businessId || undefined);
      await refreshPortfolio();
      await refreshCases();
      setStatus("Demo data seeded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed demo data");
    } finally {
      setSeeding(false);
    }
  }

  async function onCreateCase(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("Creating case...");
    try {
      await createCreditCase({
        env_id: envId,
        business_id: businessId || undefined,
        case_number: form.case_number,
        borrower_name: form.borrower_name,
        facility_type: form.facility_type,
        requested_amount: form.requested_amount || "0",
        risk_grade: form.risk_grade || undefined,
      });
      setForm({ case_number: "", borrower_name: "", facility_type: "term_loan", requested_amount: "", risk_grade: "" });
      await refreshCases();
      setStatus("Case created.");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to create case");
    }
  }

  const watchlistCount = cases.filter((item) => item.stage === "watchlist").length;

  return (
    <section className="space-y-5" data-testid="credit-risk-hub">
      <div>
        <h2 className="text-2xl font-semibold">Credit Risk Hub</h2>
        <p className="text-sm text-bm-muted2">Underwriting, portfolio analytics, covenant monitoring, and workout visibility.</p>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 rounded-lg border border-bm-border/70 bg-bm-surface/20 p-1 w-fit">
        <button
          onClick={() => setTab("portfolio")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "portfolio" ? "bg-bm-surface text-white shadow-sm" : "text-bm-muted2 hover:text-white"}`}
        >
          Portfolio Analytics
        </button>
        <button
          onClick={() => setTab("origination")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "origination" ? "bg-bm-surface text-white shadow-sm" : "text-bm-muted2 hover:text-white"}`}
        >
          Origination
        </button>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {status ? <p className="text-xs text-bm-muted2">{status}</p> : null}

      {/* ── Portfolio Analytics Tab ───────────────────────────────── */}
      {tab === "portfolio" && (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Portfolio Count</p>
              <p className="mt-1 text-xl font-semibold">{snapshot?.portfolio_count ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total UPB</p>
              <p className="mt-1 text-xl font-semibold">{fmtMoney(snapshot?.total_upb)}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">30+ DQ Rate</p>
              <p className="mt-1 text-xl font-semibold">{fmtPct(snapshot?.dq_30plus_rate)}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Exception Queue</p>
              <p className="mt-1 text-xl font-semibold">{snapshot?.exception_queue_depth ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Corpus Documents</p>
              <p className="mt-1 text-xl font-semibold">{snapshot?.corpus_document_count ?? "—"}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Link
              href={`/lab/env/${envId}/credit/portfolios/new`}
              className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
            >
              Create Portfolio
            </Link>
            <button
              onClick={onSeedDemo}
              disabled={seeding}
              className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
            >
              {seeding ? "Seeding..." : "Seed Demo"}
            </button>
          </div>

          {/* Portfolio Table */}
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Product Type</th>
                  <th className="px-4 py-3 font-medium">Vintage</th>
                  <th className="px-4 py-3 font-medium">UPB</th>
                  <th className="px-4 py-3 font-medium">Loan Count</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {portfolioLoading ? (
                  <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>Loading portfolios...</td></tr>
                ) : portfolios.length === 0 ? (
                  <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>No portfolios yet. Seed demo data to get started.</td></tr>
                ) : (
                  portfolios.map((p) => (
                    <tr key={p.portfolio_id} className="hover:bg-bm-surface/20">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/lab/env/${envId}/credit/portfolios/${p.portfolio_id}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 capitalize">{p.product_type?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-4 py-3">{p.vintage_quarter || "—"}</td>
                      <td className="px-4 py-3">{fmtMoney(p.total_upb)}</td>
                      <td className="px-4 py-3">{p.loan_count}</td>
                      <td className="px-4 py-3 capitalize">{p.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Origination Tab ──────────────────────────────────────── */}
      {tab === "origination" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Active Cases</p>
              <p className="mt-1 text-xl font-semibold">{cases.length}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Watchlist</p>
              <p className="mt-1 text-xl font-semibold">{watchlistCount}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Requested Exposure</p>
              <p className="mt-1 text-xl font-semibold">{fmtMoney(cases.reduce((sum, item) => sum + Number(item.requested_amount || 0), 0))}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Approved Exposure</p>
              <p className="mt-1 text-xl font-semibold">{fmtMoney(cases.reduce((sum, item) => sum + Number(item.approved_amount || 0), 0))}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr,340px] gap-4">
            <div className="rounded-xl border border-bm-border/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-3 font-medium">Case</th>
                    <th className="px-4 py-3 font-medium">Borrower</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Risk Grade</th>
                    <th className="px-4 py-3 font-medium">Requested</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {casesLoading ? (
                    <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>Loading cases...</td></tr>
                  ) : cases.length === 0 ? (
                    <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>No cases yet.</td></tr>
                  ) : (
                    cases.map((item) => (
                      <tr key={item.case_id} className="hover:bg-bm-surface/20">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/lab/env/${envId}/credit/cases/${item.case_id}`} className="hover:underline">
                            {item.case_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{item.borrower_name}</td>
                        <td className="px-4 py-3 capitalize">{item.stage.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">{item.risk_grade || "—"}</td>
                        <td className="px-4 py-3">{fmtMoney(item.requested_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h3 className="text-sm font-semibold mb-3">Create Case</h3>
              <form className="space-y-2" onSubmit={onCreateCase}>
                <input required value={form.case_number} onChange={(e) => setForm((prev) => ({ ...prev, case_number: e.target.value }))} placeholder="Case number" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
                <input required value={form.borrower_name} onChange={(e) => setForm((prev) => ({ ...prev, borrower_name: e.target.value }))} placeholder="Borrower" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
                <input value={form.facility_type} onChange={(e) => setForm((prev) => ({ ...prev, facility_type: e.target.value }))} placeholder="Facility type" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
                <input value={form.requested_amount} onChange={(e) => setForm((prev) => ({ ...prev, requested_amount: e.target.value }))} placeholder="Requested amount" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
                <input value={form.risk_grade} onChange={(e) => setForm((prev) => ({ ...prev, risk_grade: e.target.value }))} placeholder="Risk grade" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
                <button type="submit" className="w-full rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Add Case</button>
              </form>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
