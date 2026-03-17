"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpCircle, DatabaseZap, FileUp, Plus, RefreshCcw } from "lucide-react";
import { CircularCreateButton } from "@/components/ui/CircularCreateButton";
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
  call_id: string;
  fin_fund_id: string;
  repe_fund_id: string | null;
  fund_name: string;
  call_label: string;
  call_date: string;
  due_date: string | null;
  requested: string;
  received: string;
  outstanding: string;
  collection_rate: string;
  status: string;
  raw_status: string;
  call_type: string;
  contribution_count: number;
  investor_count: number;
  overdue_investor_count: number;
};

type CapitalCallOverview = {
  meta: {
    business_id: string;
    live_partition_id: string | null;
    has_data: boolean;
    total_rows: number;
    now_date: string;
  };
  summary: {
    open_calls: number;
    total_requested: string;
    total_received: string;
    collection_rate: string;
    outstanding_balance: string;
    overdue_investors: number;
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
    call_types: string[];
    open_calls: Array<{ call_id: string; label: string }>;
  };
  insights: {
    top_outstanding_investors: Array<{
      investor_id: string;
      investor_name: string;
      participant_type: string;
      outstanding: string;
      call_count: number;
      next_due_date: string | null;
    }>;
    upcoming_due_dates: Array<{
      call_id: string;
      call_label: string;
      fund_name: string;
      due_date: string;
      outstanding: string;
      days_until_due: number;
    }>;
    overdue_watchlist: Array<{
      investor_id: string;
      investor_name: string;
      call_id: string;
      call_label: string;
      fund_name: string;
      due_date: string;
      outstanding: string;
      days_overdue: number;
    }>;
    collection_progress_by_fund: Array<{
      fund_id: string;
      fund_name: string;
      requested: string;
      received: string;
      outstanding: string;
      collection_rate: string;
      open_calls: number;
    }>;
  };
};

type ActionKey = "new-call" | "import-contributions" | null;

const STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  partially_funded: "Partially Funded",
  fully_funded: "Fully Funded",
  overdue: "Overdue",
};

function fmtMoney(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "$0";
  if (numeric === 0) return "$0";
  if (Math.abs(numeric) >= 1_000_000_000) return `$${(numeric / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(numeric) >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1_000) return `$${(numeric / 1_000).toFixed(0)}K`;
  return `$${numeric.toFixed(0)}`;
}

function fmtPercent(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${(numeric * 100).toFixed(1)}%`;
}

function toTone(status: string): "neutral" | "positive" | "warning" | "danger" {
  if (status === "fully_funded") return "positive";
  if (status === "partially_funded") return "warning";
  if (status === "overdue") return "danger";
  return "neutral";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CapitalCallsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [overview, setOverview] = useState<CapitalCallOverview | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionKey>(null);

  const [newCallForm, setNewCallForm] = useState({
    repe_fund_id: "",
    call_type: "Acquisition",
    call_date: todayIso(),
    due_date: "",
    amount_requested: "5000000",
    purpose: "",
  });
  const [importForm, setImportForm] = useState({
    call_id: "",
    contribution_date: todayIso(),
    collection_rate: "1",
  });

  const statusFilter = searchParams.get("status") || "";
  const fundFilter = searchParams.get("fund_id") || "";
  const investorFilter = searchParams.get("investor_id") || "";
  const dateFromFilter = searchParams.get("date_from") || "";
  const dateToFilter = searchParams.get("date_to") || "";
  const callTypeFilter = searchParams.get("call_type") || "";

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
      const url = new URL("/api/re/v2/capital-calls/overview", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      if (fundFilter) url.searchParams.set("fund_id", fundFilter);
      if (investorFilter) url.searchParams.set("investor_id", investorFilter);
      if (dateFromFilter) url.searchParams.set("date_from", dateFromFilter);
      if (dateToFilter) url.searchParams.set("date_to", dateToFilter);
      if (callTypeFilter) url.searchParams.set("call_type", callTypeFilter);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to load capital call operations");
      const data = (await response.json()) as CapitalCallOverview;
      setOverview(data);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load capital call operations");
    } finally {
      setLoadingOverview(false);
    }
  }, [businessId, callTypeFilter, dateFromFilter, dateToFilter, environmentId, fundFilter, investorFilter, statusFilter]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    const fundOption = overview?.options.funds.find((option) => option.repe_fund_id) || null;
    const openCall = overview?.options.open_calls[0] || null;
    if (fundOption && !newCallForm.repe_fund_id) {
      setNewCallForm((current) => ({ ...current, repe_fund_id: fundOption.repe_fund_id || "" }));
    }
    if (openCall && !importForm.call_id) {
      setImportForm((current) => ({ ...current, call_id: openCall.call_id }));
    }
  }, [importForm.call_id, newCallForm.repe_fund_id, overview]);

  const hasActiveFilters = Boolean(statusFilter || fundFilter || investorFilter || dateFromFilter || dateToFilter || callTypeFilter);

  const kpis = useMemo<OperationsKpi[]>(
    () => [
      { label: "Open Calls", value: overview?.summary.open_calls ?? 0, detail: "Calls with remaining balances to collect." },
      { label: "Total Requested", value: fmtMoney(overview?.summary.total_requested), detail: "Issued capital demand across the filtered queue." },
      { label: "Total Received", value: fmtMoney(overview?.summary.total_received), detail: "Cash received and posted against call obligations." },
      { label: "Collection Rate", value: fmtPercent(overview?.summary.collection_rate), detail: "Received divided by total requested." },
      { label: "Outstanding Balance", value: fmtMoney(overview?.summary.outstanding_balance), detail: "Unfunded capital still outstanding." },
      { label: "Overdue Investors", value: overview?.summary.overdue_investors ?? 0, detail: "Investors with overdue funding obligations." },
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
      route: environmentId ? `/lab/env/${environmentId}/re/capital-calls` : `${basePath}/capital-calls`,
      surface: "capital_call_operations",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: "Capital Call Operations",
      selected_entities: [],
      visible_data: {
        rows: overview.rows.map((row) => ({
          entity_type: "capital_call",
          entity_id: row.call_id,
          name: row.call_label,
          metadata: {
            fund_name: row.fund_name,
            requested: row.requested,
            received: row.received,
            outstanding: row.outstanding,
            status: row.status,
          },
        })),
        metrics: overview.summary,
        notes: ["Capital call operating workspace", "Lifecycle cards reconcile to table status."],
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
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || "Request failed");
    }
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

  const onCreateCall = async () => {
    await runAction("create-call", async () => {
      await postJson("/api/re/v2/capital-calls/create", {
        env_id: environmentId,
        business_id: businessId,
        repe_fund_id: newCallForm.repe_fund_id,
        call_type: newCallForm.call_type,
        call_date: newCallForm.call_date,
        due_date: newCallForm.due_date || null,
        amount_requested: newCallForm.amount_requested,
        purpose: newCallForm.purpose || null,
      });
      setStatusMessage("Capital call created and added to the operations queue.");
      setActiveAction(null);
      await refreshOverview();
    });
  };

  const onImportContributions = async () => {
    await runAction("import-contributions", async () => {
      await postJson("/api/re/v2/capital-calls/import-contributions", {
        call_id: importForm.call_id,
        contribution_date: importForm.contribution_date,
        collection_rate: Number(importForm.collection_rate),
      });
      setStatusMessage("Contribution receipts imported against the selected capital call.");
      setActiveAction(null);
      await refreshOverview();
    });
  };

  const onSeedDemo = async () => {
    await runAction("seed-calls", async () => {
      await postJson("/api/re/v2/capital-calls/seed", {
        env_id: environmentId,
        business_id: businessId,
      });
      setStatusMessage("Capital call demo data is ready.");
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
    return <StateCard state="error" title="Failed to load capital call operations" message={pageError} onRetry={() => void refreshOverview()} />;
  }

  return (
    <section className="flex flex-col gap-5" data-testid="re-capital-call-operations">
      <OperationsHeader
        title="Capital Call Operations"
        description="Track issuance, collection progress, outstanding balances, and investor funding status."
        actions={
          <>
            <CircularCreateButton
              tooltip="New Capital Call"
              onClick={() => setActiveAction(activeAction === "new-call" ? null : "new-call")}
            />
            <OperationsActionButton
              label="Import Contributions"
              icon={<FileUp className="h-4 w-4" />}
              onClick={() => setActiveAction(activeAction === "import-contributions" ? null : "import-contributions")}
            />
            <OperationsActionButton
              label={busyAction === "seed-calls" ? "Seeding..." : "Seed Demo Data"}
              icon={<DatabaseZap className="h-4 w-4" />}
              onClick={() => void onSeedDemo()}
              disabled={busyAction === "seed-calls"}
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

      {activeAction === "new-call" ? (
        <OperationsSectionCard
          title="New Capital Call"
          subtitle="Create a live capital call against an existing fund bridge and keep the queue operational even before a full create flow exists."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <OperationsField label="Fund">
              <OperationsSelect
                value={newCallForm.repe_fund_id}
                onChange={(event) => setNewCallForm((current) => ({ ...current, repe_fund_id: event.target.value }))}
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
            <OperationsField label="Call Type">
              <OperationsSelect
                value={newCallForm.call_type}
                onChange={(event) => setNewCallForm((current) => ({ ...current, call_type: event.target.value }))}
              >
                {["Acquisition", "CapEx", "Operating Reserve", "Debt Service", "General"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </OperationsSelect>
            </OperationsField>
            <OperationsField label="Issue Date">
              <OperationsInput
                type="date"
                value={newCallForm.call_date}
                onChange={(event) => setNewCallForm((current) => ({ ...current, call_date: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Due Date">
              <OperationsInput
                type="date"
                value={newCallForm.due_date}
                onChange={(event) => setNewCallForm((current) => ({ ...current, due_date: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Amount Requested">
              <OperationsInput
                value={newCallForm.amount_requested}
                onChange={(event) => setNewCallForm((current) => ({ ...current, amount_requested: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Purpose">
              <OperationsTextarea
                value={newCallForm.purpose}
                onChange={(event) => setNewCallForm((current) => ({ ...current, purpose: event.target.value }))}
                placeholder="Optional operating note or issuance context."
              />
            </OperationsField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <OperationsActionButton
              label={busyAction === "create-call" ? "Creating..." : "Create Capital Call"}
              variant="primary"
              icon={<ArrowUpCircle className="h-4 w-4" />}
              disabled={busyAction === "create-call" || !newCallForm.repe_fund_id}
              onClick={() => void onCreateCall()}
            />
            <OperationsActionButton label="Cancel" variant="ghost" onClick={() => setActiveAction(null)} />
          </div>
        </OperationsSectionCard>
      ) : null}

      {activeAction === "import-contributions" ? (
        <OperationsSectionCard
          title="Import Contributions"
          subtitle="Apply a collection percentage to an open call and post the receipts pro rata to current fund commitments."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <OperationsField label="Capital Call">
              <OperationsSelect
                value={importForm.call_id}
                onChange={(event) => setImportForm((current) => ({ ...current, call_id: event.target.value }))}
              >
                <option value="">Select call</option>
                {overview?.options.open_calls.map((option) => (
                  <option key={option.call_id} value={option.call_id}>
                    {option.label}
                  </option>
                ))}
              </OperationsSelect>
            </OperationsField>
            <OperationsField label="Contribution Date">
              <OperationsInput
                type="date"
                value={importForm.contribution_date}
                onChange={(event) => setImportForm((current) => ({ ...current, contribution_date: event.target.value }))}
              />
            </OperationsField>
            <OperationsField label="Collection Rate">
              <OperationsSelect
                value={importForm.collection_rate}
                onChange={(event) => setImportForm((current) => ({ ...current, collection_rate: event.target.value }))}
              >
                <option value="0.25">25%</option>
                <option value="0.5">50%</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
              </OperationsSelect>
            </OperationsField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <OperationsActionButton
              label={busyAction === "import-contributions" ? "Importing..." : "Import Contributions"}
              variant="primary"
              icon={<FileUp className="h-4 w-4" />}
              disabled={busyAction === "import-contributions" || !importForm.call_id}
              onClick={() => void onImportContributions()}
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
        <OperationsField label="Call Type">
          <OperationsSelect value={callTypeFilter} onChange={(event) => setFilter("call_type", event.target.value)} data-testid="filter-call-type">
            <option value="">All call types</option>
            {overview?.options.call_types.map((option) => (
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
          title="Capital Call Queue"
          subtitle="Issued calls stay visible even when the table is empty so the workspace keeps its operating shape."
        >
          <div className="overflow-x-auto rounded-2xl border border-bm-border/25">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/40 text-left text-xs uppercase tracking-[0.14em] text-bm-muted2">
                  <th className="px-4 py-3 font-medium">Call ID</th>
                  <th className="px-4 py-3 font-medium">Fund</th>
                  <th className="px-4 py-3 font-medium">Issue Date</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium text-right">Requested</th>
                  <th className="px-4 py-3 font-medium text-right">Received</th>
                  <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {overview?.rows.length ? (
                  overview.rows.map((row) => (
                    <tr
                      key={row.call_id}
                      className="cursor-pointer transition-colors duration-75 hover:bg-bm-surface/25"
                      onClick={() => router.push(`${basePath}/capital-calls/${row.call_id}`)}
                      data-testid={`capital-call-row-${row.call_id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <Link href={`${basePath}/capital-calls/${row.call_id}`} className="font-medium text-bm-text hover:text-bm-accent">
                            {row.call_label}
                          </Link>
                          <span className="text-xs text-bm-muted2">{row.call_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-bm-text">{row.fund_name}</td>
                      <td className="px-4 py-3 tabular-nums text-bm-muted">{row.call_date}</td>
                      <td className="px-4 py-3 tabular-nums text-bm-muted">{row.due_date || "TBD"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(row.requested)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(row.received)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(row.outstanding)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <OperationsStatusPill label={STATUS_LABELS[row.status] || row.status} tone={toTone(row.status)} />
                          <span className="text-xs text-bm-muted2">
                            {fmtPercent(row.collection_rate)} collected · {row.overdue_investor_count} overdue
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
                          title="No calls match the current filters"
                          description="Try widening status, fund, investor, or date constraints to reopen the operating queue."
                          bullets={["Status", "Fund", "Investor", "Date range", "Call type"]}
                          actions={<OperationsActionButton label="Clear Filters" onClick={clearFilters} />}
                        />
                      ) : (
                        <GuidedEmptyState
                          compact
                          title="No capital calls yet"
                          description="Capital calls come from commitments, unfunded balances, and issuance events. Keep the queue structure in place so investor operations can start from a guided workspace instead of an empty shell."
                          bullets={["Commitment-backed issuances", "Unfunded balance tracking", "Investor funding watchlists"]}
                          actions={
                            <>
                              <OperationsActionButton label="Create First Call" variant="primary" onClick={() => setActiveAction("new-call")} />
                              <OperationsActionButton label="Import Commitments" onClick={() => setActiveAction("import-contributions")} />
                              <OperationsActionButton label="Seed Demo Calls" onClick={() => void onSeedDemo()} />
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
            title="Largest Outstanding Investors"
            subtitle="Concentration of remaining unfunded balances."
            emptyLabel="Outstanding balances will surface here once calls are issued."
          >
            {overview?.insights.top_outstanding_investors.map((item) => (
              <div key={item.investor_id} className="flex items-center justify-between gap-3 rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-bm-text">{item.investor_name}</p>
                  <p className="text-xs text-bm-muted2">
                    {item.call_count} calls · next due {item.next_due_date || "TBD"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(item.outstanding)}</p>
                  <p className="text-xs text-bm-muted2">{item.participant_type.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </InsightList>

          <InsightList
            title="Upcoming Due Dates"
            subtitle="Near-term collection deadlines."
            emptyLabel="Future due dates appear here once active calls have balances to collect."
          >
            {overview?.insights.upcoming_due_dates.map((item) => (
              <div key={item.call_id} className="rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{item.call_label}</p>
                    <p className="text-xs text-bm-muted2">{item.fund_name}</p>
                  </div>
                  <p className="text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(item.outstanding)}</p>
                </div>
                <p className="mt-2 text-xs text-bm-muted2">
                  Due {item.due_date} · {item.days_until_due} days out
                </p>
              </div>
            ))}
          </InsightList>

          <InsightList
            title="Overdue Funding Watchlist"
            subtitle="Investors requiring follow-up or escalation."
            emptyLabel="Overdue balances will populate this watchlist automatically."
          >
            {overview?.insights.overdue_watchlist.map((item) => (
              <div key={`${item.call_id}-${item.investor_id}`} className="rounded-xl border border-rose-500/15 bg-rose-500/5 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{item.investor_name}</p>
                    <p className="text-xs text-bm-muted2">{item.call_label} · {item.fund_name}</p>
                  </div>
                  <p className="text-sm font-semibold text-rose-200 tabular-nums">{fmtMoney(item.outstanding)}</p>
                </div>
                <p className="mt-2 text-xs text-bm-muted2">
                  Due {item.due_date} · {item.days_overdue} days overdue
                </p>
              </div>
            ))}
          </InsightList>

          <InsightList
            title="Collection Progress by Fund"
            subtitle="Funding velocity across the current fund set."
            emptyLabel="Fund-level collection progress appears once calls are issued."
          >
            {overview?.insights.collection_progress_by_fund.map((item) => (
              <div key={item.fund_id} className="rounded-xl border border-bm-border/20 bg-bm-surface/35 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{item.fund_name}</p>
                    <p className="text-xs text-bm-muted2">{item.open_calls} open calls</p>
                  </div>
                  <OperationsStatusPill label={fmtPercent(item.collection_rate)} tone={toTone(Number(item.collection_rate) >= 1 ? "fully_funded" : Number(item.collection_rate) > 0.5 ? "partially_funded" : "issued")} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-bm-muted2">
                  <div>
                    <p>Requested</p>
                    <p className="mt-1 font-medium text-bm-text tabular-nums">{fmtMoney(item.requested)}</p>
                  </div>
                  <div>
                    <p>Received</p>
                    <p className="mt-1 font-medium text-bm-text tabular-nums">{fmtMoney(item.received)}</p>
                  </div>
                  <div>
                    <p>Outstanding</p>
                    <p className="mt-1 font-medium text-bm-text tabular-nums">{fmtMoney(item.outstanding)}</p>
                  </div>
                </div>
              </div>
            ))}
          </InsightList>
        </div>
      </div>
    </section>
  );
}
