"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PROPERTY_TYPE_LABELS, label as labelFn } from "@/lib/labels";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  DollarSign,
  TrendingUp,
  Target,
  CalendarDays,
  Loader2,
  Send,
} from "lucide-react";

import { bosFetch } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import DealStatusBadge from "@/components/repe/pipeline/DealStatusBadge";
import ActivityTimeline from "@/components/repe/pipeline/ActivityTimeline";

import { fmtDate, fmtMoney, fmtMultiple, fmtNumber, fmtPct } from '@/lib/format-utils';
/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
type Deal = {
  deal_id: string;
  env_id: string;
  deal_name: string;
  status: string;
  source?: string;
  strategy?: string;
  property_type?: string;
  target_close_date?: string;
  headline_price?: number | null;
  target_irr?: number | null;
  target_moic?: number | null;
  notes?: string;
  created_at: string;
};

type Property = {
  property_id: string;
  property_name: string;
  address?: string;
  city?: string;
  state?: string;
  units?: number | null;
  sqft?: number | null;
  occupancy?: number | null;
  noi?: number | null;
  cap_rate?: number | null;
};

type Tranche = {
  tranche_id: string;
  tranche_name: string;
  type?: string;
  close_date?: string;
  commitment_amount?: number | null;
  status?: string;
};

type Activity = {
  activity_id?: string;
  activity_type: string;
  body: string;
  occurred_at: string;
  created_by?: string;
};

/* ------------------------------------------------------------------ */
/* Format helpers                                                       */
/* ------------------------------------------------------------------ */
const STRATEGY_LABELS: Record<string, string> = {
  core: "Core",
  core_plus: "Core Plus",
  value_add: "Value Add",
  opportunistic: "Opportunistic",
  debt: "Debt",
  development: "Development",
};

const TABS = ["Overview", "Properties", "Tranches", "Activity"] as const;
type Tab = (typeof TABS)[number];

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export default function DealDetailPage() {
  const { envId } = useReEnv();
  const params = useParams<{ dealId: string }>();
  const dealId = params.dealId;

  const [deal, setDeal] = useState<Deal | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tranches, setTranches] = useState<Tranche[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  /* ---- Activity composer ---- */
  const [newType, setNewType] = useState("note");
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);

  /* ---- Fetch deal ---- */
  const fetchDeal = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await bosFetch<Deal>(`/api/re/v2/pipeline/deals/${dealId}`);
      setDeal(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  /* ---- Fetch sub-resources on tab change ---- */
  const fetchProperties = useCallback(async () => {
    if (!dealId) return;
    try {
      const data = await bosFetch<Property[]>(`/api/re/v2/pipeline/deals/${dealId}/properties`);
      setProperties(data);
    } catch { /* silent */ }
  }, [dealId]);

  const fetchTranches = useCallback(async () => {
    if (!dealId) return;
    try {
      const data = await bosFetch<Tranche[]>(`/api/re/v2/pipeline/deals/${dealId}/tranches`);
      setTranches(data);
    } catch { /* silent */ }
  }, [dealId]);

  const fetchActivities = useCallback(async () => {
    if (!dealId) return;
    try {
      const data = await bosFetch<Activity[]>(`/api/re/v2/pipeline/deals/${dealId}/activities`);
      setActivities(data);
    } catch { /* silent */ }
  }, [dealId]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  useEffect(() => {
    if (tab === "Properties") fetchProperties();
    if (tab === "Tranches") fetchTranches();
    if (tab === "Activity") fetchActivities();
  }, [tab, fetchProperties, fetchTranches, fetchActivities]);

  /* ---- Post activity ---- */
  async function handlePostActivity(e: FormEvent) {
    e.preventDefault();
    if (!newBody.trim() || !dealId) return;
    setPosting(true);
    try {
      await bosFetch(`/api/re/v2/pipeline/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: newType, body: newBody }),
      });
      setNewBody("");
      fetchActivities();
    } catch { /* silent */ } finally {
      setPosting(false);
    }
  }

  /* ---- Loading / Error ---- */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error ?? "Deal not found"}
        </div>
      </div>
    );
  }

  /* ---- Render ---- */
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-bm-border px-6 py-4">
        <Link
          href={`/lab/env/${envId}/re/pipeline`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-bm-muted hover:text-bm-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Pipeline
        </Link>
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-bm-muted" />
          <h1 className="text-lg font-semibold text-bm-text">{deal.deal_name}</h1>
          <DealStatusBadge status={deal.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-bm-border px-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "border-bm-accent text-bm-accent"
                : "border-transparent text-bm-muted hover:text-bm-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "Overview" && <OverviewTab deal={deal} />}
        {tab === "Properties" && <PropertiesTab properties={properties} />}
        {tab === "Tranches" && <TranchesTab tranches={tranches} />}
        {tab === "Activity" && (
          <div className="space-y-6">
            {/* Composer */}
            <form onSubmit={handlePostActivity} className="flex items-start gap-3 rounded-lg border border-bm-border bg-bm-surface/40 p-4">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm text-bm-text focus:outline-none"
              >
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="document">Document</option>
              </select>
              <input
                type="text"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Add an activity..."
                className="flex-1 rounded-lg border border-bm-border bg-bm-bg px-3 py-1.5 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={posting || !newBody.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Post
              </button>
            </form>

            <ActivityTimeline activities={activities} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview Tab                                                         */
/* ------------------------------------------------------------------ */
function OverviewTab({ deal }: { deal: Deal }) {
  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard icon={DollarSign} label="Headline Price" value={fmtMoney(deal.headline_price)} />
        <MetricCard icon={TrendingUp} label="Target IRR" value={fmtPct(deal.target_irr)} />
        <MetricCard icon={Target} label="Target MOIC" value={fmtMultiple(deal.target_moic)} />
      </div>

      {/* Detail grid */}
      <div className="rounded-xl border border-bm-border bg-bm-surface/30 p-5">
        <h3 className="mb-4 text-sm font-semibold text-bm-text">Deal Details</h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <DetailRow label="Status" value={<DealStatusBadge status={deal.status} />} />
          <DetailRow label="Strategy" value={STRATEGY_LABELS[deal.strategy ?? ""] ?? deal.strategy ?? "--"} />
          <DetailRow label="Property Type" value={deal.property_type ? labelFn(PROPERTY_TYPE_LABELS, deal.property_type) : "--"} />
          <DetailRow label="Source" value={deal.source ?? "--"} />
          <DetailRow label="Target Close" value={fmtDate(deal.target_close_date)} />
          <DetailRow label="Created" value={fmtDate(deal.created_at)} />
        </dl>
        {deal.notes && (
          <div className="mt-4 border-t border-bm-border pt-4">
            <p className="text-xs font-medium text-bm-muted">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-bm-text">{deal.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-bm-border bg-bm-surface/30 p-4">
      <div className="mb-1 flex items-center gap-2 text-bm-muted">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-semibold text-bm-text">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-bm-muted">{label}</dt>
      <dd className="mt-0.5 text-bm-text">{typeof value === "string" ? value : value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Properties Tab                                                       */
/* ------------------------------------------------------------------ */
function PropertiesTab({ properties }: { properties: Property[] }) {
  if (!properties.length) {
    return <div className="py-12 text-center text-sm text-bm-muted">No properties linked to this deal.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-bm-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bm-border bg-bm-surface/40 text-left text-xs font-medium text-bm-muted">
            <th className="px-4 py-3">Property</th>
            <th className="px-4 py-3">Address</th>
            <th className="px-4 py-3">City</th>
            <th className="px-4 py-3">State</th>
            <th className="px-4 py-3 text-right">Units</th>
            <th className="px-4 py-3 text-right">Sq Ft</th>
            <th className="px-4 py-3 text-right">Occupancy</th>
            <th className="px-4 py-3 text-right">NOI</th>
            <th className="px-4 py-3 text-right">Cap Rate</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.property_id} className="border-b border-bm-border last:border-0 hover:bg-bm-surface/20">
              <td className="px-4 py-3 font-medium text-bm-text">{p.property_name}</td>
              <td className="px-4 py-3 text-bm-muted">{p.address ?? "--"}</td>
              <td className="px-4 py-3 text-bm-muted">{p.city ?? "--"}</td>
              <td className="px-4 py-3 text-bm-muted">{p.state ?? "--"}</td>
              <td className="px-4 py-3 text-right text-bm-text">{fmtNumber(p.units)}</td>
              <td className="px-4 py-3 text-right text-bm-text">{fmtNumber(p.sqft)}</td>
              <td className="px-4 py-3 text-right text-bm-text">{fmtPct(p.occupancy)}</td>
              <td className="px-4 py-3 text-right text-bm-text">{fmtMoney(p.noi)}</td>
              <td className="px-4 py-3 text-right text-bm-text">{fmtPct(p.cap_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tranches Tab                                                         */
/* ------------------------------------------------------------------ */
function TranchesTab({ tranches }: { tranches: Tranche[] }) {
  if (!tranches.length) {
    return <div className="py-12 text-center text-sm text-bm-muted">No tranches defined for this deal.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-bm-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bm-border bg-bm-surface/40 text-left text-xs font-medium text-bm-muted">
            <th className="px-4 py-3">Tranche</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Close Date</th>
            <th className="px-4 py-3 text-right">Commitment</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {tranches.map((t) => (
            <tr key={t.tranche_id} className="border-b border-bm-border last:border-0 hover:bg-bm-surface/20">
              <td className="px-4 py-3 font-medium text-bm-text">{t.tranche_name}</td>
              <td className="px-4 py-3 text-bm-muted">{t.type ?? "--"}</td>
              <td className="px-4 py-3 text-bm-muted">{fmtDate(t.close_date)}</td>
              <td className="px-4 py-3 text-right text-bm-text">{fmtMoney(t.commitment_amount)}</td>
              <td className="px-4 py-3">
                {t.status ? <DealStatusBadge status={t.status} /> : <span className="text-bm-muted">--</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
