"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listAllModels,
  createCrossFundModel,
  approveReV2Model,
  ReV2Model,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

const STATUS_OPTIONS = ["All", "draft", "approved", "archived"] as const;
const STRATEGY_OPTIONS = ["All", "equity", "credit", "cmbs", "mixed"] as const;

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ── Create Model Modal ─────────────────────────────────────── */
function ModelCreateModal({
  open,
  onClose,
  onCreated,
  envId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (m: ReV2Model) => void;
  envId?: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const model = await createCrossFundModel({
        name: name.trim(),
        description: description.trim() || undefined,
        strategy_type: strategy || undefined,
        env_id: envId,
      });
      onCreated(model);
      setName("");
      setDescription("");
      setStrategy("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-bm-border bg-bm-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Create Model</h3>
          <button type="button" onClick={onClose} className="text-xl text-bm-muted2">
            &times;
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Name *
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm text-bm-text"
              placeholder="Q4 2025 Portfolio Review"
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm text-bm-text"
              placeholder="Optional description..."
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Strategy
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm text-bm-text"
            >
              <option value="">None</option>
              <option value="equity">Equity</option>
              <option value="credit">Credit</option>
              <option value="cmbs">CMBS</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Model"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Models Page ─────────────────────────────────────────────── */
export default function ModelsPage() {
  const { envId } = useRepeContext();
  const base = useRepeBasePath();
  const router = useRouter();

  const [models, setModels] = useState<ReV2Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterStrategy, setFilterStrategy] = useState("All");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    if (!envId) return;
    setLoading(true);
    listAllModels(envId)
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, [envId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = models.filter((m) => {
    if (filterStatus !== "All" && m.status !== filterStatus) return false;
    if (filterStrategy !== "All" && m.strategy_type !== filterStrategy) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: models.length,
    draft: models.filter((m) => m.status === "draft").length,
    approved: models.filter((m) => m.status === "approved").length,
    archived: models.filter((m) => m.status === "archived").length,
  };

  return (
    <div className="space-y-4" data-testid="re-models-page">
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Models", value: stats.total },
          { label: "Draft", value: stats.draft },
          { label: "Approved", value: stats.approved },
          { label: "Archived", value: stats.archived },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 text-center"
          >
            <p className="text-xs uppercase tracking-wider text-bm-muted2">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Header + Filters */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Models</h2>
            <p className="text-sm text-bm-muted2">
              Cross-fund analytical models with scenario workspace
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90"
            data-testid="create-model-btn"
          >
            + New Model
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Status
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="mt-1 block w-36 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Strategy
            <select
              value={filterStrategy}
              onChange={(e) => setFilterStrategy(e.target.value)}
              className="mt-1 block w-36 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
            >
              {STRATEGY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 block w-48 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              placeholder="Search models..."
            />
          </label>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-bm-muted2">Loading models...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-bm-muted2">
          {models.length === 0
            ? "No models yet. Create one to get started."
            : "No models match your filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.model_id}
                  className="border-b border-bm-border/30 transition hover:bg-bm-surface/20 cursor-pointer"
                  onClick={() => router.push(`${base}/models/${m.model_id}`)}
                >
                  <td className="px-4 py-3 font-medium">{m.name}</td>
                  <td className="px-4 py-3 capitalize">{m.strategy_type || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.status === "approved"
                          ? "bg-green-500/20 text-green-300"
                          : m.status === "archived"
                            ? "bg-red-500/10 text-red-200"
                            : "bg-yellow-500/15 text-yellow-300"
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{m.model_type || "scenario"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <ModelCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(m) => {
          setModels((prev) => [m, ...prev]);
          router.push(`${base}/models/${m.model_id}`);
        }}
        envId={envId}
      />
    </div>
  );
}
