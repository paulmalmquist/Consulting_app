"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ApiError, fetchJson } from "@/lib/fetchJson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicBreakdown {
  anxiety: number | null;
  depression: number | null;
  adhd: number | null;
  burnout: number | null;
  relationships: number | null;
  trauma_ptsd: number | null;
  grief_loss: number | null;
  life_transitions: number | null;
  relapse_prev: number | null;
  other: number | null;
}

interface CheckinDetail {
  id: string;
  session_date: string;
  clients_seen: number | null;
  cancellations: number | null;
  no_shows: number | null;
  late_cancel: number | null;
  late_fee_applied: boolean | null;
  consultations_completed: number | null;
  new_referrals: number | null;
  intake_completed: number | null;
  converted_to_client: number | null;
  discharges: number | null;
  self_pay_sessions: number | null;
  insurance_sessions: number | null;
  revenue_dollars: number | null;
  utilization_pct: number | null;
  revenue_per_session: number | null;
  topics: TopicBreakdown;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = {
  currency: (n: number | null) =>
    n != null ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
  pct: (n: number | null) => (n != null ? `${(n * 100).toFixed(1)}%` : "—"),
  int: (n: number | null) => (n != null ? String(n) : "—"),
  bool: (b: boolean | null) =>
    b === true ? "Yes" : b === false ? "No" : "—",
  date: (s: string) =>
    new Date(s).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
};

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bm-border/20 py-2 last:border-0">
      <span className="font-mono text-xs text-bm-muted2">{label}</span>
      <span className={cn("text-sm tabular-nums", highlight ? "font-semibold text-bm-text" : "text-bm-muted")}>
        {value}
      </span>
    </div>
  );
}

const topicLabels: Record<string, string> = {
  anxiety: "Anxiety",
  depression: "Depression",
  adhd: "ADHD",
  burnout: "Burnout / Work Stress",
  relationships: "Relationships",
  trauma_ptsd: "Trauma / PTSD",
  grief_loss: "Grief & Loss",
  life_transitions: "Life Transitions",
  relapse_prev: "Relapse Prevention",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Detail component
// ---------------------------------------------------------------------------

export function AlteredMindWeekDetail({
  envId,
  date,
}: {
  envId: string;
  date: string;
}) {
  const [data, setData] = useState<CheckinDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<CheckinDetail>(`/api/am/v1/checkins/${date}?env_id=${envId}`)
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError) {
          const detail = (e.body as { detail?: string } | null)?.detail ?? "no detail";
          setError(`API ${e.status}: ${detail}`);
        } else {
          setError(String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [envId, date]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="font-mono text-xs text-bm-muted2 animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Link
          href={`/lab/env/${envId}/operator/altered-mind`}
          className="font-mono text-xs text-bm-muted2 hover:text-bm-accent"
        >
          ← Dashboard
        </Link>
        <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 p-4">
          <p className="font-mono text-xs text-bm-danger">
            No check-in found for {date}. {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const topics = Object.entries(data.topics ?? {}).filter(([, v]) => v != null && v > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs text-bm-muted2">
            <Link
              href={`/lab/env/${envId}/operator/altered-mind`}
              className="hover:text-bm-accent"
            >
              Altered Mind
            </Link>{" "}
            / Check-in Detail
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold text-bm-text">
            {fmt.date(data.session_date)}
          </h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Session volume */}
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/20 p-4">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Session Volume
          </h2>
          <StatRow label="Clients Seen" value={fmt.int(data.clients_seen)} highlight />
          <StatRow label="Self-Pay Sessions" value={fmt.int(data.self_pay_sessions)} />
          <StatRow label="Insurance Sessions" value={fmt.int(data.insurance_sessions)} />
          <StatRow label="Cancellations" value={fmt.int(data.cancellations)} />
          <StatRow label="No-Shows" value={fmt.int(data.no_shows)} />
          <StatRow label="Late Cancels" value={fmt.int(data.late_cancel)} />
          <StatRow label="Late Fee Applied" value={fmt.bool(data.late_fee_applied)} />
        </div>

        {/* Revenue */}
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/20 p-4">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Revenue
          </h2>
          <StatRow label="Total Revenue" value={fmt.currency(data.revenue_dollars)} highlight />
          <StatRow label="Revenue / Session" value={fmt.currency(data.revenue_per_session)} />
          <StatRow label="Utilization" value={fmt.pct(data.utilization_pct)} />
        </div>

        {/* Pipeline */}
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/20 p-4">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Client Pipeline
          </h2>
          <StatRow label="New Referrals" value={fmt.int(data.new_referrals)} />
          <StatRow label="Consultations" value={fmt.int(data.consultations_completed)} />
          <StatRow label="Intakes Completed" value={fmt.int(data.intake_completed)} />
          <StatRow label="Converted to Client" value={fmt.int(data.converted_to_client)} />
          <StatRow label="Discharges" value={fmt.int(data.discharges)} />
        </div>

        {/* Topics */}
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/20 p-4">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Session Topics
          </h2>
          {topics.length === 0 ? (
            <p className="text-sm text-bm-muted2">No topic data recorded.</p>
          ) : (
            topics.map(([key, count]) => (
              <StatRow
                key={key}
                label={topicLabels[key] ?? key}
                value={String(count)}
              />
            ))
          )}
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/20 p-4">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Notes
          </h2>
          <p className="text-sm text-bm-muted">{data.notes}</p>
        </div>
      )}
    </div>
  );
}
