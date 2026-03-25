"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

interface EntityLink {
  entity_type: string;
  entity_id: string;
  env_id: string;
}

interface Document {
  id: string;
  title: string;
  description: string | null;
  classification: string;
  domain: string | null;
  status: string;
  virtual_path: string | null;
  version_count: number;
  size_bytes: number | null;
  tags: string[];
  entity_links: EntityLink[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const CLASSIFICATION_OPTIONS = ["All", "loan", "subscription", "side_letter", "other"] as const;
const STATUS_OPTIONS = ["All", "draft", "review", "approved", "superseded", "archived"] as const;

function classificationLabel(c: string): string {
  switch (c) {
    case "subscription":
      return "Subscription Agreement";
    case "side_letter":
      return "Side Letter";
    case "loan":
      return "Loan";
    case "other":
      return "Other";
    default:
      return c.charAt(0).toUpperCase() + c.slice(1);
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-bm-surface/40 text-bm-muted2 border-bm-border/30";
    case "review":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "approved":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "archived":
      return "bg-bm-surface/40 text-bm-muted2 border-bm-border/30";
    case "superseded":
      return "bg-bm-surface/40 text-bm-muted2 border-bm-border/30";
    default:
      return "bg-bm-surface/40 text-bm-muted2 border-bm-border/30";
  }
}

function formatSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return d.slice(0, 10);
}

export default function DocumentsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);

  const classificationFilter = searchParams.get("classification") || "All";
  const domainFilter = searchParams.get("domain") || "";
  const statusFilter = searchParams.get("status") || "All";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "All" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const refreshDocuments = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/documents", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (classificationFilter !== "All") url.searchParams.set("classification", classificationFilter);
      if (domainFilter) url.searchParams.set("domain", domainFilter);
      if (statusFilter !== "All") url.searchParams.set("status", statusFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data.documents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    }
  }, [businessId, environmentId, classificationFilter, domainFilter, statusFilter]);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  const uniqueClassifications = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => {
      if (d.classification) set.add(d.classification);
    });
    return set.size;
  }, [documents]);

  const availableDomains = useMemo(() => {
    const domains = new Set<string>();
    documents.forEach((d) => {
      if (d.domain) domains.add(d.domain);
    });
    return Array.from(domains).sort();
  }, [documents]);

  const hasActiveFilters = classificationFilter !== "All" || domainFilter !== "" || statusFilter !== "All";

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Total Documents", value: String(documents.length) },
      { label: "Classifications", value: String(uniqueClassifications) },
    ],
    [documents.length, uniqueClassifications]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/documents` : basePath + "/documents",
      surface: "document_library",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        documents: documents.map((d) => ({
          entity_type: "document",
          entity_id: d.id,
          name: d.title,
          metadata: {
            classification: d.classification,
            domain: d.domain,
            status: d.status,
            version_count: d.version_count,
          },
        })),
        metrics: {
          total_documents: documents.length,
          classifications: uniqueClassifications,
        },
        notes: ["Document library"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, documents, uniqueClassifications]);

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

  return (
    <section className="flex flex-col gap-4" data-testid="re-documents-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Document Library</h2>
          <p className="mt-1 text-sm text-bm-muted2">
            Fund documents, subscription agreements, side letters, and loan documents.
          </p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Classification
          <select
            className="mt-1 block h-8 w-48 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={classificationFilter}
            onChange={(e) => setFilter("classification", e.target.value)}
            data-testid="filter-classification"
          >
            {CLASSIFICATION_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All Classifications" : classificationLabel(c)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Domain
          <select
            className="mt-1 block h-8 w-40 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={domainFilter}
            onChange={(e) => setFilter("domain", e.target.value)}
            data-testid="filter-domain"
          >
            <option value="">All Domains</option>
            {availableDomains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Status
          <select
            className="mt-1 block h-8 w-36 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setFilter("status", e.target.value)}
            data-testid="filter-status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.replace("?", { scroll: false })}
            className="rounded-md border border-bm-border/30 px-3 py-1.5 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && <StateCard state="error" title="Failed to load documents" message={error} />}

      {documents.length === 0 && !error ? (
        hasActiveFilters ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
            No documents match the current filters.
          </div>
        ) : (
          <StateCard
            state="empty"
            title="No documents"
            description="Documents are uploaded at the fund, investment, and asset levels."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Classification</th>
                <th className="px-4 py-2.5 font-medium">Domain</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Size</th>
                <th className="px-4 py-2.5 font-medium">Tags</th>
                <th className="px-4 py-2.5 font-medium">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="transition-colors duration-75 hover:bg-bm-surface/20"
                  data-testid={`document-row-${doc.id}`}
                >
                  <td className="px-4 py-3 font-medium text-bm-text">{doc.title}</td>
                  <td className="px-4 py-3 text-bm-muted2">
                    <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">
                      {classificationLabel(doc.classification)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{doc.domain || "\u2014"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] capitalize ${statusBadgeClass(doc.status)}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-bm-muted2">
                    {formatSize(doc.size_bytes)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(doc.tags) && doc.tags.length > 0
                        ? doc.tags.map((tag, i) => (
                            <span
                              key={`${tag}-${i}`}
                              className="inline-flex rounded-md bg-bm-surface/50 px-1.5 py-0.5 text-[10px] text-bm-muted2 border border-bm-border/20"
                            >
                              {tag}
                            </span>
                          ))
                        : <span className="text-bm-muted2">{"\u2014"}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{formatDate(doc.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
