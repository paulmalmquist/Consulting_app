"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownCircle, DatabaseZap, FileUp, PlayCircle, Plus, RefreshCcw } from "lucide-react";
import { CircularCreateButton } from "@/components/ui/CircularCreateButton";
import { runFinWaterfall } from "@/lib/bos-api";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import {
  GuidedEmptyState,
  InsightList,
  LifecycleStrip,
  OperationsActionButton,
  OperationsField,
  OperationsFilterBar,
  OperationsHeader,
  OperationsInput,
  OperationsKpiGrid,
  OperationsSectionCard,
  OperationsSelect,
  OperationsStatusPill,
  OperationsTextarea,
  type LifecycleItem,
  type OperationsKpi,
} from "@/components/repe/operations/OperationsWorkspace";
import { StateCard } from "@/components/ui/StateCard";

import { fmtMoney } from '@/lib/format-utils';
type FundOption = {
  repe_fund_id: string | null;
  fin_fund_id: string | null;
  fund_name: string;
};

type InvestorOption = {
  investor_id: string;
  investor_name: string;
  participant_type: string;
};

type OverviewRow = {
  event_id: string;
  fin_fund_id: string;
  repe_fund_id: string | null;
  fund_name: string;
  event_type: string;
  event_type_label: string;
  distribution_type: string;
  declared_date: string;
  gross_amount: string;
  declared_amount: string;
  allocated_amount: string;
  paid_amount: string;
  pending_amount: string;
  status: string;
  raw_status: string;
  payout_count: number;
  pending_recipient_count: number;
  reference: string | null;
};

type DistributionOverview = {
  meta: {
    business_id: string;
    live_partition_id: string | null;
    has_data: boolean;
    total_rows: number;
    now_date: string;
    current_quarter: string;
  };
  summary: {
    distribution_events: number;
    total_declared: string;
    total_paid: string;
    pending_amount: string;
    paid_this_quarter: string;
    pending_recipients: number;
  };
  lifecycle: Array<{
    key: string;
    label: string;
    count: number;
    amount_total: string;
  }>;
  rows: OverviewRow[];
  options: {
    funds: FundOption[];
    investors: InvestorOption[];
    distribution_types: string[];
    pending_events: Array<{ event_id: string; label: string; mode: "waterfall" | "import" }>;
  };
  insights: {
    largest_recipients: Array<{
      investor_id: string;
      investor_name: string;
      participant_type: string;
      allocated_amount: string;
      paid_amount: string;
      event_count: number;
    }>;
    pending_payout_watchlist: Array<{
      event_id: string;
      label: string;
      fund_name: string;
      pending_amount: string;
      pending_recipient_count: number;
      status: string;
    }>;
    recent_distribution_events: Array<{
      event_id: string;
      label: string;
      fund_name: string;
      declared_date: string;
      declared_amount: string;
      status: string;
    }>;
    allocation_mix_by_type: Array<{
      payout_type: string;
      amount: string;
    }>;
  };
};

type ActionKey = "new-distribution" | "run-waterfall" | "import-payouts" | null;

const STATUS_LABELS: Record<string, string> = {
  declared: "Declared",
  allocated: "Allocated",
  approved: "Approved",
  paid: "Paid",
};

function fmtPercent(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${(numeric * 100).toFixed(1)}%`;
}

function toneForStatus(status: string): "neutral" | "positive" | "warning" | "danger" {
  if (status === "paid") return "positive";
  if (status === "approved" || status === "allocated") return "warning";
  if (status === "declared") return "neutral";
  return "danger";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DistributionsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [overview, setOverview] = useState<DistributionOverview | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionKey>(null);

  const [newDistributionForm, setNewDistributionForm] = useState({
    repe_fund_id: "",
    event_date: todayIso(),
    event_type: "sale",
    gross_proceeds: "7500000",
    net_distributable: "6000000",
    reference: "",
  });
  const [runWaterfallForm, setRunWaterfallForm] = useState({
    event_id: "",
  });
  const [importForm, setImportForm] = useState({
    event_id: "",
    payout_type: "return_of_capital",
    allocation_rate: "1",
    mark_paid: true,
  });

  const statusFilter = searchParams.get("status") || "";
  const fundFilter = searchParams.get("fund_id") || "";
  const investorFilter = searchParams.get("investor_id") || "";
  const dateFromFilter = searchParams.get("date_from") || "";
  const dateToFilter = searchParams.get("date_to") || "";
  const eventTypeFilter = searchParams.get("event_type") || "";
  const distributionTypeFilter = searchParams.get("distribution_type") || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const clearFilters = () => router.replace("?", { scroll: false });

  const refreshOverview = useCallback(async () => {
    if (!environmentId) return;
    setLoadingOverview(true);
    try {
      const url = new URL("/api/re/v2/distributions/overview", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      if (fundFilter) url.searchParams.set("fund_id", fundFilter);
      if (investorFilter) url.searchParams.set("investor_id", investorFilter);
      if (dateFromFilter) url.searchParams.set("date_from", dateFromFilter);
      if (dateToFilter) url.searchParams.set("date_to", dateToFilter);
      if (eventTypeFilter) url.searchParams.set("event_type", eventTypeFilter);
      if (distributionTypeFilter) url.searchParams.set("distribution_type", distributionTypeFilter);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to load distribution operations");
      const data = (await response.json()) as DistributionOverview;
      setOverview(data);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load distribution operations");
    } finally {
      setLoadingOverview(false);
    }
  }, [businessId, dateFromFilter, dateToFilter, distributionTypeFilter, environmentId, eventTypeFilter, fundFilter, investorFilter, statusFilter]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    const fundOption = overview?.options.funds.find((option) => option.repe_fund_id) || null;
    const waterfallOption = overview?.options.pending_events.find((option) => option.mode === "waterfall") || null;
    const importOption = overview?.options.pending_events.find((option) => option.mode === "import") || overview?.options.pending_events[0] || null;
    if (fundOption && !newDistributionForm.repe_fund_id) {
      setNewDistributionForm((current) => ({ ...current, repe_fund_id: fundOption.repe_fund_id || "" }));
    }
    if (waterfallOption && !runWaterfallForm.event_id) {
      setRunWaterfallForm({ event_id: waterfallOption.event_id });
    }
    if (importOption && !importForm.event_id) {
      setImportForm((current) => ({ ...current, event_id: importOption.event_id }));
    }
  }, [importForm.event_id, newDistributionForm.repe_fund_id, overview, runWaterfallForm.event_id]);

  const hasActiveFilters = Boolean(statusFilter || fundFilter || investorFilter || dateFromFilter || dateToFilter || eventTypeFilter || distributionTypeFilter);

  const kpis = useMemo<OperationsKpi[]>(
    () => [
      { label: "Distribution Events", value: overview?.summary.distribution_events ?? 0, detail: "Declared cash movement events in the current queue." },
      { label: "Total Declared", value: fmtMoney(overview?.summary.total_declared), detail: "Investor cash approved for allocation." },
      { label: "Total Paid", value: fmtMoney(overview?.summary.total_paid), detail: "Cash movement already processed to investors." },
      { label: "Pending Amount", value: fmtMoney(overview?.summary.pending_amount), detail: "Still waiting on allocation or payout completion." },
      { label: "Paid This Quarter", value: fmtMoney(overview?.summary.paid_this_quarter), detail: "Paid distributions dated in the current quarter." },
      { label: "Pending Recipients", value: overview?.summary.pending_recipients ?? 0, detail: "Recipients still waiting on pending events." },
    ],
    [overview]
  );

  const lifecycleItems = useMemo<LifecycleItem[]>(
    () =>
      (overview?.lifecycle || []).map((item) => ({
        key: item.key,
        label: item.label,
        count: item.count,
        amount: fmtMoney(item.amount_total),
      })),
    [overview]
  );

  useEffect(() => {
    if (!overview) return;
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/distributions` : `${basePath}/distributions`,
      surface: "distribution_operations",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: "Distribution Operations",
      selected_entities: [],
      visible_data: {
        rows: overview.rows.map((row) => ({
          entity_type: "distribution_event",
          entity_id: row.event_id,
          name: `${row.event_type_label} ${row.reference ? `· ${row.reference}` : ""}`.trim(),
          metadata: {
            fund_name: row.fund_name,
            declared_amount: row.declared_amount,
            paid_amount: row.paid_amount,
            pending_amount: row.pending_amount,
            status: row.status,
          },
        })),
        metrics: overview.summary,
        notes: ["Distribution operating workspace", "Waterfall run promotes declared events into paid cash movement."],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, overview]);

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { error?: string }).error || "Request failed");
    return data;
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setActionError(null);
    setStatusMessage(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  };

  const onCreateDistribution = async () => {
    await runAction("create-distribution", async () => {
      await postJson("/api/re/v2/distributions/create", {
        env_id: environmentId,
        business_id: businessId,
        repe_fund_id: newDistributionForm.repe_fund_id,
        event_date: newDistributionForm.event_date,
        event_type: newDistributionForm.event_type,
        gross_proceeds: newDistributionForm.gross_proceeds,
        net_distributable: newDistributionForm.net_distributable,
        reference: newDistributionForm.reference || null,
      });
      setStatusMessage("Distribution event created and queued for allocation.");
      setActiveAction(null);
      await refreshOverview();
    });
  };

  const onRunWaterfall = async () => {
    await runAction("run-waterfall", async () => {
      const selectedRow = overview?.rows.find((row) => row.event_id === runWaterfallForm.event_id);
      if (!selectedRow) throw new Error("Select a pending distribution event to run.");
      if (!businessId) throw new Error("Business context is required to run the waterfall.");
      if (!overview?.meta.live_partition_id) throw new Error("No live finance partition is available for waterfall execution.");
      await runFinWaterfall(selectedRow.fin_fund_id, {
        business_id: businessId,
        partition_id: overview.meta.live_partition_id,
        as_of_date: overview.meta.now_date,
        idempotency_key: `wf_${selectedRow.event_id}_${Date.now()}`,
        distribution_event_id: selectedRow.event_id,
      });
      setStatusMessage("Waterfall completed and payout rows refreshed.");
      setActiveAction(null);
      await refreshOverview();
    });
  };

  const onImportPayouts = async () => {
    await runAction("import-payouts", async () => {
      await postJson("/api/re/v2/distributions/import-payouts", {
        event_id: importForm.event_id,
        payout_type: importForm.payout_type,
        allocation_rate: Number(importForm.allocation_rate),
        mark_paid: importForm.mark_paid,
      });
      setStatusMessage("Payout allocations imported and status updated where fully paid.");
      setActiveAction(null);
      await refreshOverview();
    });
  };

  const onSeedDemo = async () => {
    await runAction("seed-distributions", async () => {
      await postJson("/api/re/v2/distributions/seed", {
        env_id: environmentId,
        business_id: businessId,
      });
      setStatusMessage("Distribution demo data is ready.");
      await refreshOverview();
    });
  };

  if (!businessId) {
    if (loading) return <StateCard state="loading" />;
    return (
      <StateCard
        state="error"
        title="REPE workspace not initialized"
        message={contextError || "Unable to resolve workspace context."}
        onRetry={() => void initializeWorkspace()}
      />
    );
  }

  if (loadingOverview && !overview) {
    return <StateCard state="loading" />;
  }

  if (pageError && !overview) {
    return <StateCard state="error" title="Failed to load distribution operations" message={pageError} onRetry={() => void refreshOverview()} />;
  }

  return (
    <section className="flex flex-col gap-5" data-testid="re-distribution-operations">
      <OperationsHeader
        title="Distribution Operations"
        description="Track declared distributions, allocations, payout status, and partner cash movement."
        actions={
          <>
            <CircularCreateButton
              tooltip="New Distribution"
              onClick={() => setActiveAction(activeAction === "new-distribution" ? null : "new-distribution")}
            />
            <OperationsActionButton
              label="Run Waterfall"
              icon={<PlayCircle className="h-4 w-4" />}
              onClick={() => setActiveAction(activeAction === "run-waterfall" ? null : "run-waterfall")}
            />
            <OperationsActionButton
              label="Import Payouts"
              icon={<FileUp className="h-4 w-4" />}
              onClick={() => setActiveAction(activeAction === "import-payouts" ? null : "import-payouts")}
            />
            <OperationsActionButton
              label={busyAction === "seed-distributions" ? "Seeding..." : "Seed Demo Data"}
              icon={<DatabaseZap className="h-4 w-4" />}
              onClick={() => void onSeedDemo()}
              disabled={busyAction === "seed-distributions"}
            />
          </>
        }
      />

      {statusMessage ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{statusMessage}</div>
      ) : null}
      {actionError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{actionError}</div>
      ) : null}
      {pageError && overview ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {pageError}
        </div>
      ) : null}

      {activeAction === "new-distribution" ? (
        <OperationsSectionCard
          title="New Distribution"
          subtitle="Declare a new distribution event against a fund so it can move through allocation, approval, and payout."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <OperationsField label="Fund">
              <OperationsSelect
                value={newDistributionForm.repe_fund_id}
                onChange={(event) => setNewDistributionForm((current) => ({ ...current, repe_fund_id: event.target.value }))}
              >
                <option value="">Select fund</option>
                {overview?.options.funds
                  .filter((option) => option.repe_fund_id)
                  .map((option) => (
                    <option key={option.repe_fund_id} value={option.repe_fund_id || ""}>
                      {option.fund_name}
                    </option>
                  ))}
              </OperationsSelect>
            </OperationsField>
            <OperationsField label="Event Type">
              <OperationsSelect
                value={newDistributionForm.event_type}
                onChange={(event) => setNewDistributionForm((current) => ({ ...current, event_type: event.target.value }))}
              >
                {[
                  { value: "sale", label: "Sale" },
                  { value: "partial_sale", label: "Partial Sale" },
                  { value: "refinance", label: "Refinance" },
                  { value: "operating_distribution", label: "Operating Distribution" },
                  { value: "other", label: "Other" },
                ].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </OperationsSelect>
            </OperationsField>
            <OperationsField label="Declared Date">
              <OperationsInput
                type="date"
                value={newDistributionForm.event_date}
                onChange={(event) => setNewDistributionForm((current) => ({ ...current, event_date: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Gross Amount">
              <OperationsInput
                value={newDistributionForm.gross_proceeds}
                onChange={(event) => setNewDistributionForm((current) => ({ ...current, gross_proceeds: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Net Distributable">
              <OperationsInput
                value={newDistributionForm.net_distributable}
                onChange={(event) => setNewDistributionForm((current) => ({ ...current, net_distributable: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Reference">
              <OperationsTextarea
                value={newDistributionForm.reference}
                onChange={(event) => setNewDistributionForm((current) => ({ ...current, reference: event.target.value }))}
                placeholder="Optional reference, realization note, or operating cash context."
              />
            </OperationsField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <OperationsActionButton
              label={busyAction === "create-distribution" ? "Creating..." : "Create Distribution"}
              icon={<ArrowDownCircle className="h-4 w-4" />}
              variant="primary"
              disabled={busyAction === "create-distribution" || !newDistributionForm.repe_fund_id}
              onClick={() => void onCreateDistribution()}
            />
            <OperationsActionButton label="Cancel" variant="ghost" onClick={() => setActiveAction(null)} />
          </div>
        </OperationsSectionCard>
      ) : null}

      {activeAction === "run-waterfall" ? (
        <OperationsSectionCard
          title="Run Waterfall"
          subtitle="Use the fund engine to allocate a declared distribution event and post the resulting payouts."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <OperationsField label="Pending Distribution">
              <OperationsSelect
                value={runWaterfallForm.event_id}
                onChange={(event) => setRunWaterfallForm({ event_id: event.target.value })}
              >
                <option value="">Select event</option>
                {overview?.options.pending_events
                  .filter((option) => option.mode === "waterfall")
                  .map((option) => (
                    <option key={option.event_id} value={option.event_id}>
                      {option.label}
                    </option>
                  ))}
              </OperationsSelect>
            </OperationsField>
            <div className="rounded-xl border border-bm-border/20 bg-bm-surface/35 px-4 py-3 text-sm text-bm-muted2">
              Waterfall runs are limited to declared events with no imported allocation rows yet. Once the run completes, the event becomes paid and the payout ledger refreshes automatically.
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <OperationsActionButton
              label={busyAction === "run-waterfall" ? "Running..." : "Run Waterfall"}
              icon={<PlayCircle className="h-4 w-4" />}
              variant="primary"
              disabled={busyAction === "run-waterfall" || !runWaterfallForm.event_id}
              onClick={() => void onRunWaterfall()}
            />
            <OperationsActionButton label="Cancel" variant="ghost" onClick={() => setActiveAction(null)} />
          </div>
        </OperationsSectionCard>
      ) : null}

      {activeAction === "import-payouts" ? (
        <OperationsSectionCard
          title="Import Payouts"
          subtitle="Load payout allocations into a pending event and optionally mark it as paid when the import fully covers the declared amount."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <OperationsField label="Distribution Event">
              <OperationsSelect
                value={importForm.event_id}
                onChange={(event) => setImportForm((current) => ({ ...current, event_id: event.target.value }))}
              >
                <option value="">Select event</option>
                {overview?.options.pending_events.map((option) => (
                  <option key={option.event_id} value={option.event_id}>
                    {option.label}
                  </option>
                ))}
              </OperationsSelect>
            </OperationsField>
            <OperationsField label="Payout Type">
              <OperationsSelect
                value={importForm.payout_type}
                onChange={(event) => setImportForm((current) => ({ ...current, payout_type: event.target.value }))}
              >
                {[
                  "return_of_capital",
                  "preferred_return",
                  "catch_up",
                  "carry",
                  "fee",
                  "other",
                ].map((option) => (
                  <option key={option} value={option}>
                    {option.replace(/_/g, " ")}
                  </option>
                ))}
              </OperationsSelect>
            </OperationsField>
            <OperationsField label="Allocation Rate">
              <OperationsSelect
                value={importForm.allocation_rate}
                onChange={(event) => setImportForm((current) => ({ ...current, allocation_rate: event.target.value }))}
              >
                <option value="0.5">50%</option>
                <option value="1">100%</option>
              </OperationsSelect>
            </OperationsField>
            <label className="flex items-center gap-3 rounded-xl border border-bm-border/20 bg-bm-surface/35 px-4 py-3 text-sm text-bm-text">
              <input
                type="checkbox"
                checked={importForm.mark_paid}
                onChange={(event) => setImportForm((current) => ({ ...current, mark_paid: event.target.checked }))}
              />
              Mark event paid when fully allocated
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <OperationsActionButton
              label={busyAction === "import-payouts" ? "Importing..." : "Import Payouts"}
              icon={<FileUp className="h-4 w-4" />}
              variant="primary"
              disabled={busyAction === "import-payouts" || !importForm.event_id}
              onClick={() => void onImportPayouts()}
            />
            <OperationsActionButton label="Cancel" variant="ghost" onClick={() => setActiveAction(null)} />
          </div>
        </OperationsSectionCard>
      ) : null}

      <OperationsKpiGrid kpis={kpis} />
      <LifecycleStrip items={lifecycleItems} />

      <OperationsFilterBar>
        <OperationsField label="Status">
          <OperationsSelect value={statusFilter} onChange={(event) => setFilter("status", event.target.value)} data-testid="filter-status">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </OperationsSelect>
        </OperationsField>
        <OperationsField label="Event Type">
          <OperationsSelect value={eventTypeFilter} onChange={(event) => setFilter("event_type", event.target.value)} data-testid="filter-event-type">
            <option value="">All event types</option>
            {Array.from(new Set((overview?.rows || []).map((row) => row.event_type))).map((option) => (
              <option key={option} value={option}>
                {(overview?.rows.find((row) => row.event_type === option)?.event_type_label) || option}
              </option>
            ))}
          </OperationsSelect>
        </OperationsField>
        <OperationsField label="Fund">
          <OperationsSelect value={fundFilter} onChange={(event) => setFilter("fund_id", event.target.value)} data-testid="filter-fund">
            <option value="">All funds</option>
            {overview?.options.funds.map((option) => (
              <option key={`${option.repe_fund_id || option.fin_fund_id || option.fund_name}`} value={option.repe_fund_id || option.fin_fund_id || ""}>
                {option.fund_name}
              </option>
            ))}
          </OperationsSelect>
        </OperationsField>
        <OperationsField label="Investor">
          <OperationsSelect value={investorFilter} onChange={(event) => setFilter("investor_id", event.target.value)} data-testid="filter-investor">
            <option value="">All investors</option>
            {overview?.options.investors.map((option) => (
              <option key={option.investor_id} value={option.investor_id}>
                {option.investor_name}
              </option>
            ))}
          </OperationsSelect>
        </OperationsField>
        <OperationsField label="Date From">
          <OperationsInput type="date" value={dateFromFilter} onChange={(event) => setFilter("date_from", event.target.value)} />
        </OperationsField>
        <OperationsField label="Date To">
          <OperationsInput type="date" value={dateToFilter} onChange={(event) => setFilter("date_to", event.target.value)} />
        </OperationsField>
        <OperationsField label="Distribution Type">
          <OperationsSelect value={distributionTypeFilter} onChange={(event) => setFilter("distribution_type", event.target.value)} data-testid="filter-distribution-type">
            <option value="">All distribution types</option>
            {overview?.options.distribution_types.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </OperationsSelect>
        </OperationsField>
        <div className="flex items-end">
          <OperationsActionButton
            label="Clear Filters"
            icon={<RefreshCcw className="h-4 w-4" />}
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          />
        </div>
      </OperationsFilterBar>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
        <OperationsSectionCard
          title="Distribution Queue"
          subtitle="Declared events, allocation progress, and payout completion stay visible even when the queue is empty."
        >
          <div className="overflow-x-auto rounded-2xl border border-bm-border/25">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/40 text-left text-xs uppercase tracking-[0.14em] text-bm-muted2">
                  <th className="px-4 py-3 font-medium">Distribution ID</th>
                  <th className="px-4 py-3 font-medium">Fund</th>
                  <th className="px-4 py-3 font-medium">Event Type</th>
                  <th className="px-4 py-3 font-medium">Declared Date</th>
                  <th className="px-4 py-3 font-medium text-right">Gross Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Paid Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Pending Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {overview?.rows.length ? (
                  overview.rows.map((row) => (
                    <tr
                      key={row.event_id}
                      className="cursor-pointer transition-colors duration-75 hover:bg-bm-surface/25"
                      onClick={() => router.push(`${basePath}/distributions/${row.event_id}`)}
                      data-testid={`distribution-row-${row.event_id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <Link href={`${basePath}/distributions/${row.event_id}`} className="font-medium text-bm-text hover:text-bm-accent">
                            {row.reference || row.event_type_label}
                          </Link>
                          <span className="text-xs text-bm-muted2">{row.distribution_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-bm-text">{row.fund_name}</td>
                      <td className="px-4 py-3 text-bm-muted">{row.event_type_label}</td>
                      <td className="px-4 py-3 tabular-nums text-bm-muted">{row.declared_date}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(row.gross_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(row.paid_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(row.pending_amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <OperationsStatusPill label={STATUS_LABELS[row.status] || row.status} tone={toneForStatus(row.status)} />
                          <span className="text-xs text-bm-muted2">
                            {row.pending_recipient_count} pending recipients · {row.payout_count} payout rows
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-4">
                      {hasActiveFilters ? (
                        <GuidedEmptyState
                          compact
                          title="No distributions match the current filters"
                          description="Widen the workflow filters to reopen the distribution queue."
                          bullets={["Status", "Event type", "Fund", "Investor", "Date range", "Distribution type"]}
                          actions={<OperationsActionButton label="Clear Filters" onClick={clearFilters} />}
                        />
                      ) : (
                        <GuidedEmptyState
                          compact
                          title="No distributions yet"
                          description="Distributions come from realization events, operating cash, and waterfall allocations. Keep the payout workflow visible so the page still feels like a live operating surface in zero-data mode."
                          bullets={["Realization events", "Operating cash releases", "Waterfall-backed allocations"]}
                          actions={
                            <>
                              <OperationsActionButton label="Create First Distribution" variant="primary" onClick={() => setActiveAction("new-distribution")} />
                              <OperationsActionButton label="Run Waterfall" onClick={() => setActiveAction("run-waterfall")} />
                              <OperationsActionButton label="Seed Demo Distributions" onClick={() => void onSeedDemo()} />
                            </>
                          }
                        />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </OperationsSectionCard>

        <div className="space-y-5">
          <InsightList
            title="Largest Recipients"
            subtitle="Recipients with the largest allocation footprint."
            emptyLabel="Recipient concentration appears here once payout rows exist."
          >
            {overview?.insights.largest_recipients.map((item) => (
              <div key={item.investor_id} className="flex items-center justify-between gap-3 rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-bm-text">{item.investor_name}</p>
                  <p className="text-xs text-bm-muted2">{item.event_count} events</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(item.allocated_amount)}</p>
                  <p className="text-xs text-bm-muted2">Paid {fmtMoney(item.paid_amount)}</p>
                </div>
              </div>
            ))}
          </InsightList>

          <InsightList
            title="Pending Payout Watchlist"
            subtitle="Events with remaining payout execution risk."
            emptyLabel="Pending payout risk will surface here when the queue has unpaid events."
          >
            {overview?.insights.pending_payout_watchlist.map((item) => (
              <div key={item.event_id} className="rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{item.label}</p>
                    <p className="text-xs text-bm-muted2">{item.fund_name}</p>
                  </div>
                  <OperationsStatusPill label={STATUS_LABELS[item.status] || item.status} tone={toneForStatus(item.status)} />
                </div>
                <p className="mt-2 text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(item.pending_amount)}</p>
                <p className="mt-1 text-xs text-bm-muted2">{item.pending_recipient_count} recipients still pending</p>
              </div>
            ))}
          </InsightList>

          <InsightList
            title="Recent Distribution Events"
            subtitle="Latest declared cash movement across funds."
            emptyLabel="Recent events will appear after distributions are declared."
          >
            {overview?.insights.recent_distribution_events.map((item) => (
              <div key={item.event_id} className="rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{item.label}</p>
                    <p className="text-xs text-bm-muted2">{item.fund_name}</p>
                  </div>
                  <p className="text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(item.declared_amount)}</p>
                </div>
                <p className="mt-2 text-xs text-bm-muted2">
                  {item.declared_date} · {STATUS_LABELS[item.status] || item.status}
                </p>
              </div>
            ))}
          </InsightList>

          <InsightList
            title="Allocation Mix by Type"
            subtitle="Payout composition across the filtered result set."
            emptyLabel="Payout type mix appears here once allocations or imports exist."
          >
            {overview?.insights.allocation_mix_by_type.map((item) => (
              <div key={item.payout_type} className="flex items-center justify-between gap-3 rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <p className="text-sm font-medium text-bm-text">{item.payout_type.replace(/_/g, " ")}</p>
                <p className="text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(item.amount)}</p>
              </div>
            ))}
          </InsightList>
        </div>
      </div>
    </section>
  );
}
