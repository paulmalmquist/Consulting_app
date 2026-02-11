"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  type Contact,
  type Company,
  getContacts,
  getCompanies,
  addContact,
  isTouchOverdue,
} from "@/lib/envData";

type Props = { envId: string };

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  companyId: "",
  title: "",
  email: "",
  phone: "",
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

export default function CrmContacts({ envId }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(() => getContacts(envId));
  const [companies] = useState<Company[]>(() => getCompanies(envId));
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");

  const companyLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) map.set(c.id, c.name);
    return map;
  }, [companies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.owner || "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        (c.companyId && (companyLookup.get(c.companyId) || "").toLowerCase().includes(q))
    );
  }, [contacts, search, companyLookup]);

  const handleAdd = useCallback(() => {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    addContact(envId, {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      companyId: form.companyId || undefined,
      title: form.title.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      owner: form.owner.trim() || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      touchCadenceDays: form.touchCadenceDays ? Number(form.touchCadenceDays) : undefined,
    });
    setContacts(getContacts(envId));
    setForm(EMPTY_FORM);
    setShowModal(false);
  }, [envId, form]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Contacts</CardTitle>
            <button
              type="button"
              data-testid="add-contact-button"
              onClick={() => setShowModal(true)}
              className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-sm text-bm-text hover:bg-bm-accent/20 transition"
            >
              Add Contact
            </button>
          </div>
          <input
            type="search"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3 w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
          />
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-surface/30">
        <table className="w-full text-sm" data-testid="contacts-table">
          <thead>
            <tr className="border-b border-bm-border/50 text-left text-xs uppercase tracking-wider text-bm-muted2">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Last Touch</th>
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
                  data-testid={`contact-row-${c.id}`}
                  className="border-b border-bm-border/30 hover:bg-bm-surface/40 transition"
                >
                  <td className="px-4 py-3 font-medium text-bm-text">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-3 text-bm-muted">
                    {c.companyId ? companyLookup.get(c.companyId) || "--" : "--"}
                  </td>
                  <td className="px-4 py-3 text-bm-muted">{c.title || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted">{c.email || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted">{c.phone || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted">{c.owner || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted">{formatDate(c.lastTouchAt)}</td>
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
                <td colSpan={9} className="px-4 py-6 text-center text-bm-muted">
                  No contacts yet. Click &quot;Add Contact&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add Contact Modal ──────────────────────────────────── */}
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
            data-testid="add-contact-modal"
          >
            <h3 className="mb-4 text-lg font-semibold text-bm-text">Add Contact</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="First Name *"
                  value={form.firstName}
                  data-testid="contact-firstname-input"
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
                <input
                  placeholder="Last Name *"
                  value={form.lastName}
                  data-testid="contact-lastname-input"
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
              </div>
              <select
                value={form.companyId}
                data-testid="contact-company-select"
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
              >
                <option value="">-- Select Company --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
                <input
                  placeholder="Owner"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                />
                <input
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                data-testid="save-contact-button"
                onClick={handleAdd}
                disabled={!form.firstName.trim() || !form.lastName.trim()}
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
