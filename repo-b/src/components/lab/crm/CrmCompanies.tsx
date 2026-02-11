"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  type Company,
  getCompanies,
  addCompany,
  isTouchOverdue,
} from "@/lib/envData";

type Props = { envId: string };

const EMPTY_FORM = {
  name: "",
  website: "",
  industry: "",
  size: "",
  location: "",
  owner: "",
  tags: "",
  touchCadenceDays: "",
};

function formatDate(iso?: string): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString();
}

function touchStatus(nextTouchDueAt?: string): { label: string; cls: string } {
  if (!nextTouchDueAt) return { label: "--", cls: "" };
  if (isTouchOverdue(nextTouchDueAt)) return { label: "Overdue", cls: "text-bm-danger" };
  return { label: formatDate(nextTouchDueAt), cls: "" };
}

export default function CrmCompanies({ envId }: Props) {
  const [companies, setCompanies] = useState<Company[]>(() => getCompanies(envId));
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry || "").toLowerCase().includes(q) ||
        (c.owner || "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const handleAdd = useCallback(() => {
    if (!form.name.trim()) return;
    addCompany(envId, {
      name: form.name.trim(),
      website: form.website.trim() || undefined,
      industry: form.industry.trim() || undefined,
      size: form.size.trim() || undefined,
      location: form.location.trim() || undefined,
      owner: form.owner.trim() || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      touchCadenceDays: form.touchCadenceDays ? Number(form.touchCadenceDays) : undefined,
    });
    setCompanies(getCompanies(envId));
    setForm(EMPTY_FORM);
    setShowModal(false);
  }, [envId, form]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Companies</CardTitle>
            <button
              type="button"
              data-testid="add-company-button"
              onClick={() => setShowModal(true)}
              className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-sm text-bm-text hover:bg-bm-accent/20 transition"
            >
              Add Company
            </button>
          </div>
          <input
            type="search"
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3 w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
          />
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-surface/30">
        <table className="w-full text-sm" data-testid="companies-table">
          <thead>
            <tr className="border-b border-bm-border/50 text-left text-xs uppercase tracking-wider text-bm-muted2">
              <th className="px-4 py-3">Company Name</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Last Touch</th>
              <th className="px-4 py-3">Touch Goal</th>
              <th className="px-4 py-3">Next Touch Due</th>
              <th className="px-4 py-3">Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const status = touchStatus(c.nextTouchDueAt);
              return (
                <tr
                  key={c.id}
                  data-testid={`company-row-${c.id}`}
                  className="border-b border-bm-border/30 hover:bg-bm-surface/40 transition"
                >
                  <td className="px-4 py-3 font-medium text-bm-text">{c.name}</td>
                  <td className="px-4 py-3 text-bm-muted">{c.industry || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted">{c.owner || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted">{formatDate(c.lastTouchAt)}</td>
                  <td className="px-4 py-3 text-bm-muted">
                    {c.touchCadenceDays ? `${c.touchCadenceDays}d` : "--"}
                  </td>
                  <td className={`px-4 py-3 ${status.cls}`}>{status.label}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-bm-accent/10 px-2 py-0.5 text-xs text-bm-accent"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-bm-muted">
                  No companies yet. Click &quot;Add Company&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add Company Modal ──────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setShowModal(false)}
          />
          <div
            className="relative w-full max-w-lg rounded-xl border border-bm-border/70 bg-bm-bg p-6"
            data-testid="add-company-modal"
          >
            <h3 className="mb-4 text-lg font-semibold text-bm-text">Add Company</h3>
            <div className="space-y-3">
              <input
                placeholder="Company Name *"
                value={form.name}
                data-testid="company-name-input"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
              <input
                placeholder="Website"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Industry"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
                <input
                  placeholder="Size (e.g., 50-200)"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
                <input
                  placeholder="Owner"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
              </div>
              <input
                placeholder="Tags (comma-separated)"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
              <input
                type="number"
                placeholder="Touch cadence (days, e.g., 14)"
                value={form.touchCadenceDays}
                onChange={(e) => setForm({ ...form, touchCadenceDays: e.target.value })}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-bm-border/70 px-4 py-2 text-sm text-bm-muted hover:text-bm-text transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="save-company-button"
                onClick={handleAdd}
                disabled={!form.name.trim()}
                className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm text-bm-text hover:bg-bm-accent/20 transition disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
