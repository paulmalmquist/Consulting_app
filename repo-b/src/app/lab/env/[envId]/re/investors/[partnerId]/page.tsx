"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

import { fmtMoney, fmtMultiple, fmtPct } from '@/lib/format-utils';
interface PartnerProfile {
  partner_id: string;
  name: string;
  partner_type: string;
  business_id: string;
  created_at: string;
}

interface Commitment {
  fund_id: string;
  fund_name: string;
  vintage_year: number | null;
  strategy: string | null;
  committed_amount: string;
  commitment_date: string | null;
}

interface FundMetric {
  fund_id: string;
  fund_name: string;
  quarter: string;
  contributed: string;
  distributed: string;
  nav_share: string;
  dpi: string;
  tvpi: string;
  irr: string;
}

interface CapitalEntry {
  entry_id: string;
  fund_id: string;
  fund_name: string;
  entry_type: string;
  amount: string;
  effective_date: string;
  quarter: string;
  memo: string | null;
}

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

export default function InvestorDetailPage() {
  const params = useParams();
  const partnerId = params.partnerId as string;
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const quarter = pickCurrentQuarter();

  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [metrics, setMetrics] = useState<FundMetric[]>([]);
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<CapitalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const detailUrl = new URL(`/api/re/v2/investors/${partnerId}`, window.location.origin);
      detailUrl.searchParams.set("quarter", quarter);
      const detailRes = await fetch(detailUrl.toString());
      if (!detailRes.ok) throw new Error("Failed to load investor");
      const detail = await detailRes.json();
      setPartner(detail.partner);
      setCommitments(detail.commitments || []);
      setMetrics(detail.metrics || []);
      setTotals(detail.totals || {});

      // Capital activity
      const actUrl = new URL(`/api/re/v2/investors/${partnerId}/capital-activity`, window.location.origin);
      const actRes = await fetch(actUrl.toString());
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivity(actData.entries || []);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investor");
    } finally {
      setLoading(false);
    }
  }, [partnerId, quarter]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    if (!partner) return;
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/investors/${partnerId}`
        : `${basePath}/investors/${partnerId}`,
      surface: "investor_detail",
      active_module: "re",
      page_entity_type: "investor",
      page_entity_id: partnerId,
      page_entity_name: partner.name,
      selected_entities: [],
      visible_data: {
        partner: {
          name: partner.name,
          partner_type: partner.partner_type,
          total_committed: totals.total_committed,
          total_contributed: totals.total_contributed,
          total_distributed: totals.total_distributed,
        },
        commitments: commitments.map((c) => ({
          fund_name: c.fund_name,
          committed: c.committed_amount,
        })),
        notes: [`Investor detail as of ${quarter}`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, partnerId, partner, commitments, totals, quarter]);

  if (loading) return <StateCard state="loading" />;
  if (error || !partner) {
    return <StateCard state="error" title="Investor not found" message={error || "No data"} />;
  }

  const kpis: KpiDef[] = [
    { label: "Total Committed", value: fmtMoney(totals.total_committed) },
    { label: "Total Contributed", value: fmtMoney(totals.total_contributed) },
    { label: "Total Distributed", value: fmtMoney(totals.total_distributed) },
    { label: "Funds", value: String(commitments.length) },
  ];

  return (
    <section className="flex flex-col gap-6" data-testid="re-investor-detail">
      {/* Header */}
      <div>
        <Link
          href={`${basePath}/investors`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-bm-muted2 hover:text-bm-text"
        >
          <ArrowLeft className="h-3 w-3" /> All Investors
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-bm-text">{partner.name}</h2>
          <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs text-bm-muted2">
            {partner.partner_type === "lp" ? "LP" : partner.partner_type === "gp" ? "GP" : partner.partner_type}
          </span>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      {/* Commitments Table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Fund Commitments</h3>
        {commitments.length === 0 ? (
          <p className="text-sm text-bm-muted2">No commitments found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Fund</th>
                  <th className="px-4 py-2.5 font-medium">Strategy</th>
                  <th className="px-4 py-2.5 font-medium text-right">Vintage</th>
                  <th className="px-4 py-2.5 font-medium text-right">Committed</th>
                  <th className="px-4 py-2.5 font-medium text-right">Contributed</th>
                  <th className="px-4 py-2.5 font-medium text-right">Distributed</th>
                  <th className="px-4 py-2.5 font-medium text-right">TVPI</th>
                  <th className="px-4 py-2.5 font-medium text-right">IRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {commitments.map((c) => {
                  const m = metrics.find((fm) => fm.fund_id === c.fund_id);
                  return (
                    <tr key={c.fund_id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                      <td className="px-4 py-3">
                        <Link
                          href={`${basePath}/funds/${c.fund_id}`}
                          className="font-medium text-bm-text hover:text-bm-accent"
                        >
                          {c.fund_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-bm-muted2">{c.strategy || "\u2014"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.vintage_year || "\u2014"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(c.committed_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m ? fmtMoney(m.contributed) : "\u2014"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m ? fmtMoney(m.distributed) : "\u2014"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m ? fmtMultiple(m.tvpi) : "\u2014"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m ? fmtPct(m.irr) : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Capital Activity */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Capital Activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm text-bm-muted2">No capital activity recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Fund</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Quarter</th>
                  <th className="px-4 py-2.5 font-medium">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {activity.map((entry) => (
                  <tr key={entry.entry_id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{entry.effective_date}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        entry.entry_type === "contribution" || entry.entry_type === "capital_call"
                          ? "bg-blue-500/10 text-blue-400"
                          : entry.entry_type === "distribution"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-bm-surface/40 text-bm-muted2"
                      }`}>
                        {entry.entry_type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">{entry.fund_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(entry.amount)}</td>
                    <td className="px-4 py-3 text-bm-muted2">{entry.quarter}</td>
                    <td className="px-4 py-3 text-bm-muted2 max-w-xs truncate">{entry.memo || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
