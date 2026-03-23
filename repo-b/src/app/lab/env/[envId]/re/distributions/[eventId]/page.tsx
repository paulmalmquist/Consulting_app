"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

import { fmtMoney } from '@/lib/format-utils';
const EVENT_TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  partial_sale: "Partial Sale",
  refinance: "Refinance",
  operating_distribution: "Operating Distribution",
};

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "Catch-Up",
  carry: "Carry",
  fee: "Fee",
  clawback_settlement: "Clawback Settlement",
};

interface EventDetail {
  event_id: string;
  fund_id: string;
  fund_name: string;
  event_type: string;
  total_amount: string;
  effective_date: string;
  status: string;
  created_at: string;
}

interface Payout {
  payout_id: string;
  event_id: string;
  partner_id: string;
  partner_name: string;
  partner_type: string;
  payout_type: string;
  amount: string;
  status: string;
  created_at: string;
}

const EVENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  processed: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
};

const PAYOUT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  processed: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
};

const PAYOUT_TYPE_COLORS: Record<string, string> = {
  return_of_capital: "bg-blue-500/10 text-blue-400",
  preferred_return: "bg-purple-500/10 text-purple-400",
  catch_up: "bg-orange-500/10 text-orange-400",
  carry: "bg-emerald-500/10 text-emerald-400",
  fee: "bg-gray-500/10 text-gray-400",
  clawback_settlement: "bg-red-500/10 text-red-400",
};

export default function DistributionDetailPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [totals, setTotals] = useState<Record<string, string | number | Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const url = new URL(`/api/re/v2/distributions/${eventId}`, window.location.origin);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load distribution event");
      const data = await res.json();
      setEvent(data.event);
      setPayouts(data.payouts || []);
      setTotals(data.totals || {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load distribution event");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    if (!event) return;
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/distributions/${eventId}`
        : `${basePath}/distributions/${eventId}`,
      surface: "distribution_detail",
      active_module: "re",
      page_entity_type: "distribution_event",
      page_entity_id: eventId,
      page_entity_name: `${EVENT_TYPE_LABELS[event.event_type] || event.event_type} Distribution`,
      selected_entities: [],
      visible_data: {
        event: {
          event_type: event.event_type,
          fund_name: event.fund_name,
          total_amount: event.total_amount,
          status: event.status,
        },
        payouts: payouts.map((p) => ({
          partner_name: p.partner_name,
          payout_type: p.payout_type,
          amount: p.amount,
          status: p.status,
        })),
        notes: [`Distribution event detail`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, eventId, event, payouts]);

  if (loading) return <StateCard state="loading" />;
  if (error || !event) {
    return <StateCard state="error" title="Distribution event not found" message={error || "No data"} />;
  }

  const kpis: KpiDef[] = [
    { label: "Total Amount", value: fmtMoney(event.total_amount) },
    { label: "Payouts", value: String(totals.payout_count || 0) },
  ];

  const byType = (totals.by_type || {}) as Record<string, string>;

  return (
    <section className="flex flex-col gap-6" data-testid="re-distribution-detail">
      {/* Header */}
      <div>
        <Link
          href={`${basePath}/distributions`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-bm-muted2 hover:text-bm-text"
        >
          <ArrowLeft className="h-3 w-3" /> Distribution Operations
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-bm-text">
            {EVENT_TYPE_LABELS[event.event_type] || event.event_type} Distribution
          </h2>
          <span className={`rounded-full px-2 py-0.5 text-xs ${EVENT_STATUS_COLORS[event.status] || "bg-bm-surface/40 text-bm-muted2"}`}>
            {event.status}
          </span>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      {/* Event Info */}
      <div className="rounded-xl border border-bm-border/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-bm-text">Event Information</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Fund</dt>
            <dd className="mt-0.5 text-bm-text">
              <Link href={`${basePath}/funds/${event.fund_id}`} className="hover:text-bm-accent">
                {event.fund_name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Event Type</dt>
            <dd className="mt-0.5 text-bm-text">{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Effective Date</dt>
            <dd className="mt-0.5 tabular-nums text-bm-text">{event.effective_date}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-bm-muted2">Total Amount</dt>
            <dd className="mt-0.5 tabular-nums text-bm-text">{fmtMoney(event.total_amount)}</dd>
          </div>
        </dl>
      </div>

      {/* Payout Type Breakdown */}
      {Object.keys(byType).length > 0 && (
        <div className="rounded-xl border border-bm-border/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-bm-text">Payout Breakdown by Type</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byType).map(([type, amount]) => (
              <div key={type} className="rounded-lg border border-bm-border/20 px-4 py-2">
                <div className="text-xs uppercase tracking-wider text-bm-muted2">
                  {PAYOUT_TYPE_LABELS[type] || type.replace(/_/g, " ")}
                </div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-bm-text">{fmtMoney(amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payouts Table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Payouts</h3>
        {payouts.length === 0 ? (
          <p className="text-sm text-bm-muted2">No payouts recorded for this event.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Partner</th>
                  <th className="px-4 py-2.5 font-medium">Payout Type</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {payouts.map((p) => (
                  <tr key={p.payout_id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`${basePath}/investors/${p.partner_id}`}
                        className="font-medium text-bm-text hover:text-bm-accent"
                      >
                        {p.partner_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${PAYOUT_TYPE_COLORS[p.payout_type] || "bg-bm-surface/40 text-bm-muted2"}`}>
                        {PAYOUT_TYPE_LABELS[p.payout_type] || p.payout_type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${PAYOUT_STATUS_COLORS[p.status] || "bg-bm-surface/40 text-bm-muted2"}`}>
                        {p.status}
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
