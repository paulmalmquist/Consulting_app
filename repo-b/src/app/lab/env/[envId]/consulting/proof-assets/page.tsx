"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import {
  fetchProofAssets,
  createProofAsset,
  updateProofAsset,
  type ProofAsset,
  type ProofAssetSummary,
  fetchProofAssetSummary,
} from "@/lib/cro-api";

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  draft: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  needs_update: "bg-red-500/20 text-red-400 border-red-500/30",
  archived: "bg-bm-surface/40 text-bm-muted2 border-bm-border/40",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  diagnostic_questionnaire: "Diagnostic",
  offer_sheet: "Offer Sheet",
  workflow_example: "Workflow",
  case_study: "Case Study",
  roi_calculator: "ROI Calc",
  demo_script: "Demo Script",
  competitive_comparison: "Competitive",
  other: "Other",
};

const STATUS_OPTIONS = ["draft", "ready", "needs_update", "archived"] as const;
const ASSET_TYPE_OPTIONS = [
  "diagnostic_questionnaire",
  "offer_sheet",
  "workflow_example",
  "case_study",
  "roi_calculator",
  "demo_script",
  "competitive_comparison",
  "other",
] as const;

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function ProofAssetsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [assets, setAssets] = useState<ProofAsset[]>([]);
  const [summary, setSummary] = useState<ProofAssetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<string>("workflow_example");
  const [formDesc, setFormDesc] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [assetData, summaryData] = await Promise.all([
        fetchProofAssets(params.envId, businessId),
        fetchProofAssetSummary(params.envId, businessId),
      ]);
      setAssets(assetData);
      setSummary(summaryData);
    } catch (err) {
      console.error("Failed to load proof assets:", err);
    } finally {
      setLoading(false);
    }
  }, [params.envId, businessId]);

  useEffect(() => {
    if (ready && businessId) void reload();
  }, [ready, businessId, reload]);

  const handleStatusChange = async (assetId: string, newStatus: string) => {
    try {
      await updateProofAsset(assetId, { status: newStatus });
      void reload();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleCreate = async () => {
    if (!businessId || !formTitle.trim()) return;
    setFormSaving(true);
    try {
      await createProofAsset({
        env_id: params.envId,
        business_id: businessId,
        asset_type: formType,
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
      });
      setFormTitle("");
      setFormDesc("");
      setShowForm(false);
      void reload();
    } catch (err) {
      console.error("Failed to create proof asset:", err);
    } finally {
      setFormSaving(false);
    }
  };

  if (contextLoading) {
    return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  }

  if (contextError) {
    return (
      <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-5 py-4 text-sm text-bm-text">
        <p className="font-semibold">Environment unavailable</p>
        <p className="mt-1 text-bm-muted2">{contextError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Summary Strip */}
      {summary ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <span className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Status</span>
          <span className="text-sm font-semibold text-emerald-400">{summary.ready} ready</span>
          <span className="text-sm text-amber-400">{summary.draft} draft</span>
          <span className="text-sm text-red-400">{summary.needs_update} need update</span>
          <span className="text-sm text-bm-muted2">{summary.archived} archived</span>
          <span className="text-sm text-bm-muted2 ml-auto">{summary.total} total</span>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/20"
        >
          {showForm ? "Cancel" : "+ Add Proof Asset"}
        </button>
        <Link
          href={`/lab/env/${params.envId}/consulting`}
          className="text-xs text-bm-muted2 hover:text-bm-text"
        >
          Back to Command Center
        </Link>
      </div>

      {/* Create Form */}
      {showForm ? (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs text-bm-muted2 mb-1">Title</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. AI Operations Diagnostic v2"
                  className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
              </div>
              <div>
                <label className="block text-xs text-bm-muted2 mb-1">Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text"
                >
                  {ASSET_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{ASSET_TYPE_LABELS[t] ?? t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-bm-muted2 mb-1">Description</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                placeholder="What is this asset and when should it be used?"
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={formSaving || !formTitle.trim()}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/80 disabled:opacity-50"
            >
              {formSaving ? "Creating..." : "Create"}
            </button>
          </CardContent>
        </Card>
      ) : null}

      {/* Asset List */}
      {loading ? (
        <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 px-5 py-8 text-center">
          <p className="text-sm text-bm-muted2">No proof assets yet. Seed the environment or add assets manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-bm-border/50 bg-bm-surface/10 transition-colors">
              <button
                onClick={() => setExpandedId(expandedId === asset.id ? null : asset.id)}
                className="w-full px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusPill status={asset.status} />
                    <span className="text-xs text-bm-muted2 shrink-0">
                      {ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}
                    </span>
                    <span className="text-sm font-medium text-bm-text truncate">{asset.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {asset.use_count > 0 ? (
                      <span className="text-[10px] text-bm-muted2">{asset.use_count} uses</span>
                    ) : null}
                    <span className="text-xs text-bm-muted2">
                      {new Date(asset.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </button>

              {expandedId === asset.id ? (
                <div className="border-t border-bm-border/30 px-4 py-3 space-y-3">
                  {asset.description ? (
                    <p className="text-sm text-bm-muted2">{asset.description}</p>
                  ) : null}
                  {asset.content_markdown ? (
                    <pre className="rounded-lg bg-bm-bg p-3 text-xs text-bm-text overflow-x-auto whitespace-pre-wrap">
                      {asset.content_markdown}
                    </pre>
                  ) : null}
                  {(asset.asset_type === "workflow_example" || asset.asset_type === "case_study") ? (
                    <Link
                      href={`/lab/env/${params.envId}/resume`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-bm-accent/30 bg-bm-accent/10 px-2.5 py-1 text-[11px] font-medium text-bm-accent hover:bg-bm-accent/20 transition-colors"
                    >
                      See in Resume
                    </Link>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-bm-muted2">Status:</span>
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(asset.id, s)}
                        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          asset.status === s
                            ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/40"
                            : "bg-bm-surface/20 text-bm-muted2 hover:bg-bm-surface/40 border border-transparent"
                        }`}
                      >
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
