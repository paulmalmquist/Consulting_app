"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface CallDetail {
  call_id: string;
  fund_id: string;
  fund_name: string;
  call_number: number;
  call_date: string;
  due_date: string;
  amount_requested: string;
  purpose: string | null;
  status: string;
  created_at: string;
}

interface Contribution {
  contribution_id: string;
  call_id: string;
  partner_id: string;
  partner_name: string;
  partner_type: string;
  contribution_date: string | null;
  amount_contributed: string;
  status: string;
  created_at: string;
}

const CALL_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  issued: "bg-blue-500/10 text-blue-400",
  closed: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
};

const CONTRIB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  collected: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  waived: "bg-gray-500/10 text-gray-400",
};

export default function CapitalCallDetailPage() {
  const params = useParams();
  const callId = params.callId as string;
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();

  const [call, setCall] = useState<CallDetail | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [totals, setTotals] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    if (!callId) return;
    setLoading(true);
    try {
      const url = new URL(`/api/re/v2/capital-calls/${callId}`, window.location.origin);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load capital call");
      const data = await res.json();
      setCall(data.call);
      setContributions(data.contributions || []);
      setTotals(data.totals || {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capital call");
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    if (!call) return;
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/capital-calls/${callId}`
        : `${basePath}/capital-calls/${callId}`,
      surface: "capital_call_detail",
      active_module: "re",
      page_entity_type: "capital_call",
      page_entity_id: callId,
      page_entity_name: `Capital Call #${call.call_number}`,
      selected_entities: [],
      visible_data: {
        call: {
          call_number: call.call_number,
          fund_name: call.fund_name,
          amount_requested: call.amount_requested,
          status: call.status,
        },
        contributions: contributions.map((c) => ({
          partner_name: c.partner_name,
          amount: c.amount_contributed,
          status: c.status,
        })),
        notes: [`Capital call #${call.call_number} detail`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, callId, call, contributions]);

  if (loading) return <StateCard state="loading" />;
  if (error || !call) {
    return <StateCard state="error" title="Capital call not found" message={error || "No data"} />;
  }

  const kpis: KpiDef[] = [
    { label: "Amount Requested", value: fmtMoney(call.amount_requested) },
    { label: "Total Contributed", value: fmtMoney(totals.total_contributed) },
    { label: "Outstanding", value: fmtMoney(totals.outstanding) },
    { label: "Contributions", value: String(totals.contribution_count || 0) },
  ];

  return (
    <section className="flex flex-col gap-6" data-testid="re-capital-call-detail">
      {/* Header */}
      <div>
        <Link
          href={`${basePath}/capital-calls`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-bm-muted2 hover:text-bm-text"
        >
          <ArrowLeft className="h-3 w-3" /> Capital Call Operations
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-bm-text">
            Capital Call #{call.call_number}
          </h2>
          <span className={`rounded-full px-2 py-0.5 text-xs ${CALL_STATUS_COLORS[call.status] || "bg-bm-surface/40 text-bm-muted2"}`}>
            {call.status}
          </span>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      {/* Call Info */}
      <div className="rounded-xl border border-bm-border/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-bm-text">Call Information</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Fund</dt>
            <dd className="mt-0.5 text-bm-text">
              <Link href={`${basePath}/funds/${call.fund_id}`} className="hover:text-bm-accent">
                {call.fund_name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Call Date</dt>
            <dd className="mt-0.5 tabular-nums text-bm-text">{call.call_date}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Due Date</dt>
            <dd className="mt-0.5 tabular-nums text-bm-text">{call.due_date}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Purpose</dt>
            <dd className="mt-0.5 text-bm-text">{call.purpose || "\u2014"}</dd>
          </div>
        </dl>
      </div>

      {/* Contributions Table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Contributions</h3>
        {contributions.length === 0 ? (
          <p className="text-sm text-bm-muted2">No contributions recorded for this call.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Partner</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount Contributed</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {contributions.map((c) => (
                  <tr key={c.contribution_id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`${basePath}/investors/${c.partner_id}`}
                        className="font-medium text-bm-text hover:text-bm-accent"
                      >
                        {c.partner_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">
                      <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">
                        {c.partner_type === "lp" ? "LP" : c.partner_type === "gp" ? "GP" : c.partner_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(c.amount_contributed)}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{c.contribution_date || "\u2014"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CONTRIB_STATUS_COLORS[c.status] || "bg-bm-surface/40 text-bm-muted2"}`}>
                        {c.status}
                      </span>
                    </td>
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
