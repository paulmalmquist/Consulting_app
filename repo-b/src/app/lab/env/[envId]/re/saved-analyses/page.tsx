"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

interface SavedAnalysis {
  id: string;
  title: string;
  description: string | null;
  nl_prompt: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  collection_name: string | null;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return d.slice(0, 10);
}

export default function SavedAnalysesPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);

  const collectionFilter = searchParams.get("collection_id") || "";

  const refreshAnalyses = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/saved-analyses", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (collectionFilter) url.searchParams.set("collection_id", collectionFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load saved analyses");
      const data = await res.json();
      setAnalyses(data.analyses || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved analyses");
    }
  }, [businessId, environmentId, collectionFilter]);

  useEffect(() => {
    void refreshAnalyses();
  }, [refreshAnalyses]);

  const collectionNames = useMemo(() => {
    const names = new Set<string>();
    analyses.forEach((a) => {
      if (a.collection_name) names.add(a.collection_name);
    });
    return Array.from(names).sort();
  }, [analyses]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Total Analyses", value: String(analyses.length) },
      { label: "Collections", value: String(collectionNames.length) },
    ],
    [analyses.length, collectionNames.length]
  );

  // Handle save_analysis action from Winston chat
  useEffect(() => {
    const specKey = searchParams.get("save_analysis");
    if (!specKey || !environmentId || !businessId) return;

    try {
      const raw = localStorage.getItem(specKey);
      if (!raw) return;
      const spec = JSON.parse(raw) as {
        title?: string;
        description?: string;
        nl_prompt?: string;
        sql_text?: string;
        visualization_spec?: unknown;
      };

      const doSave = async () => {
        const res = await fetch("/api/re/v2/saved-analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: spec.title || "Untitled Analysis",
            description: spec.description || null,
            nl_prompt: spec.nl_prompt || null,
            sql_text: spec.sql_text || null,
            visualization_spec: spec.visualization_spec || null,
            env_id: environmentId,
            business_id: businessId,
          }),
        });
        if (res.ok) {
          localStorage.removeItem(specKey);
          const params = new URLSearchParams(searchParams.toString());
          params.delete("save_analysis");
          const qs = params.toString();
          router.replace(qs ? `?${qs}` : "?", { scroll: false });
          void refreshAnalyses();
        }
      };
      void doSave();
    } catch {
      // ignore parse errors
    }
  }, [searchParams, environmentId, businessId, router, refreshAnalyses]);

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/saved-analyses` : basePath + "/saved-analyses",
      surface: "saved_analyses_list",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        analyses: analyses.map((a) => ({
          entity_type: "analytics_query",
          entity_id: a.id,
          name: a.title,
          metadata: {
            description: a.description,
            created_by: a.created_by,
            collection_name: a.collection_name,
          },
        })),
        metrics: {
          total_analyses: analyses.length,
          collections: collectionNames.length,
        },
        notes: ["Saved analyses library"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, analyses, collectionNames.length]);

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
    <section className="flex flex-col gap-4" data-testid="re-saved-analyses-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Saved Analyses</h2>
          <p className="mt-1 text-sm text-bm-muted2">Queries and visualizations saved from Winston analytics.</p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      {error && <StateCard state="error" title="Failed to load analyses" message={error} />}

      {analyses.length === 0 && !error ? (
        <StateCard
          state="empty"
          title="No saved analyses"
          message="Analyses are saved from Winston chat or the analytics workspace."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium">Source Prompt</th>
                <th className="px-4 py-2.5 font-medium">Collection</th>
                <th className="px-4 py-2.5 font-medium">Created By</th>
                <th className="px-4 py-2.5 font-medium">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {analyses.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer transition-colors duration-75 hover:bg-bm-surface/20"
                  onClick={() => {
                    const url = new URL(
                      `/api/re/v2/saved-analyses/${a.id}`,
                      window.location.origin
                    );
                    if (environmentId) url.searchParams.set("env_id", environmentId);
                    if (businessId) url.searchParams.set("business_id", businessId);
                    // Navigate to detail -- for now, open detail in current page context
                    window.open(url.toString(), "_blank");
                  }}
                  data-testid={`analysis-row-${a.id}`}
                >
                  <td className="px-4 py-3 font-medium text-bm-text">{a.title}</td>
                  <td className="px-4 py-3 text-bm-muted2 max-w-xs truncate">
                    {a.description || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-bm-muted2 max-w-xs truncate">
                    {a.nl_prompt || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">
                    {a.collection_name ? (
                      <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">
                        {a.collection_name}
                      </span>
                    ) : (
                      "\u2014"
                    )}
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{a.created_by || "\u2014"}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{formatDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
