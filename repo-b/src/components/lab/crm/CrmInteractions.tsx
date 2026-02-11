"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  type Interaction,
  type Company,
  type Contact,
  getInteractions,
  getCompanies,
  getContacts,
  addInteraction,
} from "@/lib/envData";

type Props = { envId: string };

const INTERACTION_TYPES = ["call", "email", "meeting", "text", "other"] as const;

const EMPTY_FORM = {
  companyId: "",
  contactId: "",
  type: "call" as Interaction["type"],
  occurredAt: new Date().toISOString().slice(0, 16),
  summary: "",
  outcome: "",
  nextActionAt: "",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function CrmInteractions({ envId }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>(() => getInteractions(envId));
  const [companies] = useState<Company[]>(() => getCompanies(envId));
  const [contacts] = useState<Contact[]>(() => getContacts(envId));
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const companyLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) map.set(c.id, c.name);
    return map;
  }, [companies]);

  const contactLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) map.set(c.id, `${c.firstName} ${c.lastName}`);
    return map;
  }, [contacts]);

  // Sort newest first
  const sorted = useMemo(
    () => [...interactions].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    [interactions]
  );

  const handleAdd = useCallback(() => {
    if (!form.summary.trim()) return;
    addInteraction(envId, {
      companyId: form.companyId || undefined,
      contactId: form.contactId || undefined,
      type: form.type,
      occurredAt: new Date(form.occurredAt).toISOString(),
      summary: form.summary.trim(),
      outcome: form.outcome.trim() || undefined,
      nextActionAt: form.nextActionAt ? new Date(form.nextActionAt).toISOString() : undefined,
    });
    setInteractions(getInteractions(envId));
    setForm({ ...EMPTY_FORM, occurredAt: new Date().toISOString().slice(0, 16) });
    setShowModal(false);
  }, [envId, form]);

  const typeLabel: Record<string, string> = {
    call: "Call",
    email: "Email",
    meeting: "Meeting",
    text: "Text",
    other: "Other",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Interactions</CardTitle>
            <button
              type="button"
              data-testid="log-interaction-button"
              onClick={() => setShowModal(true)}
              className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-sm text-bm-text hover:bg-bm-accent/20 transition"
            >
              Log Interaction
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-surface/30">
        <table className="w-full text-sm" data-testid="interactions-table">
          <thead>
            <tr className="border-b border-bm-border/50 text-left text-xs uppercase tracking-wider text-bm-muted2">
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i) => (
              <tr
                key={i.id}
                data-testid={`interaction-row-${i.id}`}
                className="border-b border-bm-border/30 hover:bg-bm-surface/40 transition"
              >
                <td className="px-4 py-3">
                  <span className="rounded-full bg-bm-surface/50 px-2 py-0.5 text-xs font-medium">
                    {typeLabel[i.type] || i.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-bm-muted whitespace-nowrap">
                  {formatDateTime(i.occurredAt)}
                </td>
                <td className="px-4 py-3 text-bm-muted">
                  {i.companyId ? companyLookup.get(i.companyId) || "--" : "--"}
                </td>
                <td className="px-4 py-3 text-bm-muted">
                  {i.contactId ? contactLookup.get(i.contactId) || "--" : "--"}
                </td>
                <td className="px-4 py-3 text-bm-text max-w-xs truncate">{i.summary}</td>
                <td className="px-4 py-3 text-bm-muted">{i.outcome || "--"}</td>
                <td className="px-4 py-3 text-bm-muted whitespace-nowrap">
                  {i.nextActionAt ? new Date(i.nextActionAt).toLocaleDateString() : "--"}
                </td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-bm-muted">
                  No interactions yet. Click &quot;Log Interaction&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Log Interaction Modal ──────────────────────────────── */}
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
            data-testid="log-interaction-modal"
          >
            <h3 className="mb-4 text-lg font-semibold text-bm-text">Log Interaction</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.type}
                  data-testid="interaction-type-select"
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as Interaction["type"] })
                  }
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
                >
                  {INTERACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={form.occurredAt}
                  data-testid="interaction-date-input"
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.companyId}
                  data-testid="interaction-company-select"
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
                >
                  <option value="">-- Company --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={form.contactId}
                  data-testid="interaction-contact-select"
                  onChange={(e) => setForm({ ...form, contactId: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
                >
                  <option value="">-- Contact --</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Summary / Notes *"
                value={form.summary}
                data-testid="interaction-summary-input"
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
              <input
                placeholder="Outcome"
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
              />
              <div>
                <label className="block text-xs text-bm-muted2 mb-1">Next Action Date (optional)</label>
                <input
                  type="date"
                  value={form.nextActionAt}
                  onChange={(e) => setForm({ ...form, nextActionAt: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
                />
              </div>
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
                data-testid="save-interaction-button"
                onClick={handleAdd}
                disabled={!form.summary.trim()}
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
