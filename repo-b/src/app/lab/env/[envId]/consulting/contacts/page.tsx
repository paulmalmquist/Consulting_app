"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { LeftSidebar } from "@/components/operator/command-desk/layout/LeftSidebar";
import { consultingSidebarSections } from "@/app/lab/env/[envId]/operator/_sidebar";
import {
  createContact as apiCreateContact,
  fetchContacts,
  fetchLeads,
  type ContactListItem,
  type Lead,
} from "@/lib/cro-api";

type RelationshipStrength = "cold" | "warm" | "hot" | "champion";
type FilterKey = "all" | "no_email" | "no_linkedin" | "needs_touch" | "no_account";

const STRENGTH_TONE: Record<RelationshipStrength, { color: string; bg: string }> = {
  cold: { color: "rgba(148,163,184,0.92)", bg: "rgba(148,163,184,0.12)" },
  warm: { color: "#FBBF24", bg: "rgba(251,191,36,0.14)" },
  hot: { color: "#FB923C", bg: "rgba(251,146,60,0.16)" },
  champion: { color: "#34D399", bg: "rgba(52,211,153,0.16)" },
};

function fmtRelDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "1d ago";
  if (diff < 30) return `${diff}d ago`;
  return d.toLocaleDateString();
}

const winstonBrand: ReactNode = (
  <span
    className="font-command"
    style={{
      fontSize: "1rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#ffffff",
      textShadow: "0 0 12px rgba(255,255,255,0.07)",
    }}
  >
    WINSTON
  </span>
);

export default function ContactsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();

  const [accounts, setAccounts] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    crm_account_id: "",
    title: "",
    email: "",
    phone: "",
    linkedin_url: "",
    relationship_strength: "warm" as RelationshipStrength,
    notes: "",
  });

  const loadData = useCallback(() => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setErrMsg(null);
    Promise.all([
      fetchContacts(params.envId, businessId),
      fetchLeads(params.envId, businessId),
    ])
      .then(([result, leads]) => {
        setContacts(result.contacts);
        setTotal(result.total);
        setAccounts(leads);
      })
      .catch((err) => {
        setErrMsg(err instanceof Error ? err.message : "Failed to load contacts");
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.account_name ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.title ?? "").toLowerCase().includes(q),
      );
    }
    if (activeFilter === "no_email") list = list.filter((c) => !c.email);
    else if (activeFilter === "no_linkedin") list = list.filter((c) => !c.linkedin_url);
    else if (activeFilter === "needs_touch") list = list.filter((c) => !c.last_outreach_at);
    else if (activeFilter === "no_account") list = list.filter((c) => !c.crm_account_id);
    return list;
  }, [contacts, search, activeFilter]);

  // KPI counts
  const kpi = useMemo(() => ({
    total: contacts.length,
    noEmail: contacts.filter((c) => !c.email).length,
    noLinkedIn: contacts.filter((c) => !c.linkedin_url).length,
    needsTouch: contacts.filter((c) => !c.last_outreach_at).length,
    noAccount: contacts.filter((c) => !c.crm_account_id).length,
  }), [contacts]);

  async function submitContact() {
    if (!businessId || !form.full_name.trim()) return;
    setSaving(true);
    setErrMsg(null);
    try {
      await apiCreateContact({
        env_id: params.envId,
        business_id: businessId,
        crm_account_id: form.crm_account_id || undefined,
        full_name: form.full_name.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        title: form.title || undefined,
        linkedin_url: form.linkedin_url || undefined,
        relationship_strength: form.relationship_strength,
        notes: form.notes || undefined,
      });
      setShowAdd(false);
      setForm({
        full_name: "",
        crm_account_id: "",
        title: "",
        email: "",
        phone: "",
        linkedin_url: "",
        relationship_strength: "warm",
        notes: "",
      });
      loadData();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        gridTemplateRows: "52px minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
        background: "#05070B",
      }}
    >
      <LeftSidebar
        mode="brand"
        brand={winstonBrand}
        sections={consultingSidebarSections(params.envId)}
        activeKey="contacts"
      />

      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          minWidth: 0,
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(220,230,240,0.72)",
            flexShrink: 0,
          }}
        >
          Contacts
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, firm, email…"
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: 280,
            padding: "5px 10px",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(5,7,11,0.6)",
            color: "#dce6f0",
            fontSize: 12,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "rgba(220,230,240,0.40)" }}>
            {loading ? "loading…" : `${filteredContacts.length}${filteredContacts.length !== total ? `/${total}` : ""}`}
          </span>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "5px 12px",
              borderRadius: 3,
              border: "1px solid rgba(0,220,255,0.40)",
              background: "rgba(0,220,255,0.08)",
              color: "#00DCFF",
              cursor: "pointer",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            {showAdd ? "Cancel" : "+ Contact"}
          </button>
        </div>
      </div>

      <LeftSidebar
        mode="nav"
        sections={consultingSidebarSections(params.envId)}
        activeKey="contacts"
      />

      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "16px 16px 24px",
          color: "#dce6f0",
        }}
      >
        {errMsg ? (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid rgba(239,68,68,0.30)",
              background: "rgba(239,68,68,0.08)",
              color: "#FCA5A5",
              fontSize: 13,
            }}
          >
            {errMsg}
          </div>
        ) : null}

        {/* KPI strip */}
        {!loading && contacts.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {[
              { label: "Total", value: kpi.total, key: "all" as FilterKey },
              { label: "No email", value: kpi.noEmail, key: "no_email" as FilterKey },
              { label: "No LinkedIn", value: kpi.noLinkedIn, key: "no_linkedin" as FilterKey },
              { label: "Needs touch", value: kpi.needsTouch, key: "needs_touch" as FilterKey },
              { label: "No account", value: kpi.noAccount, key: "no_account" as FilterKey },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveFilter(item.key)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 3,
                  border: `1px solid ${activeFilter === item.key ? "rgba(0,220,255,0.40)" : "rgba(255,255,255,0.07)"}`,
                  background: activeFilter === item.key ? "rgba(0,220,255,0.06)" : "rgba(10,14,20,0.4)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: activeFilter === item.key ? "#00DCFF" : "#dce6f0",
                    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  }}
                >
                  {item.value}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(220,230,240,0.42)",
                    marginTop: 2,
                    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  }}
                >
                  {item.label}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {showAdd ? (
          <div
            style={{
              marginBottom: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 4,
              background: "rgba(10,14,20,0.6)",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <Field label="Full name *">
                <Input value={form.full_name} onChange={(v) => setForm((s) => ({ ...s, full_name: v }))} placeholder="Jane Reddington" />
              </Field>
              <Field label="Firm / account">
                <select
                  value={form.crm_account_id}
                  onChange={(e) => setForm((s) => ({ ...s, crm_account_id: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">— Unaffiliated —</option>
                  {accounts.map((a) => (
                    <option key={a.crm_account_id} value={a.crm_account_id}>
                      {a.company_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <Input value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} placeholder="CFO" />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(v) => setForm((s) => ({ ...s, email: v }))} placeholder="jane@firm.com" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} placeholder="+1 …" />
              </Field>
              <Field label="LinkedIn">
                <Input value={form.linkedin_url} onChange={(v) => setForm((s) => ({ ...s, linkedin_url: v }))} placeholder="linkedin.com/in/…" />
              </Field>
              <Field label="Relationship">
                <select
                  value={form.relationship_strength}
                  onChange={(e) => setForm((s) => ({ ...s, relationship_strength: e.target.value as RelationshipStrength }))}
                  style={selectStyle}
                >
                  <option value="cold">cold</option>
                  <option value="warm">warm</option>
                  <option value="hot">hot</option>
                  <option value="champion">champion</option>
                </select>
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </Field>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void submitContact()}
                disabled={saving || !form.full_name.trim()}
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "6px 14px",
                  borderRadius: 3,
                  border: "1px solid rgba(0,220,255,0.40)",
                  background: saving ? "rgba(0,220,255,0.04)" : "rgba(0,220,255,0.10)",
                  color: "#00DCFF",
                  cursor: saving || !form.full_name.trim() ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  opacity: !form.full_name.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "Saving…" : "Save contact"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "6px 14px",
                  borderRadius: 3,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "rgba(220,230,240,0.72)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(220,230,240,0.40)", fontSize: 13 }}>
            Loading contacts…
          </div>
        ) : filteredContacts.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(255,255,255,0.12)",
              borderRadius: 4,
              padding: "24px 20px",
              color: "rgba(220,230,240,0.60)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ marginBottom: 8, color: "rgba(220,230,240,0.85)", fontSize: 14 }}>No contacts yet.</div>
            <div>
              Add a contact above, or open{" "}
              <Link href={`/lab/env/${params.envId}/consulting/pipeline`} style={{ color: "#00DCFF", textDecoration: "none" }}>
                Pipeline
              </Link>{" "}
              and create account-linked contacts inside a deal drawer.
            </div>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.4fr 1fr 1.5fr 0.7fr 0.6fr",
                padding: "8px 12px",
                background: "rgba(10,14,20,0.6)",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                fontSize: 10,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: "rgba(220,230,240,0.42)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}
            >
              <span>Name</span>
              <span>Firm</span>
              <span>Title</span>
              <span>Email</span>
              <span>Strength</span>
              <span>Last touch</span>
            </div>
            {filteredContacts.map((c) => {
              const tone = (c.relationship_strength as RelationshipStrength) in STRENGTH_TONE
                ? STRENGTH_TONE[c.relationship_strength as RelationshipStrength]
                : STRENGTH_TONE.cold;
              return (
                <Link
                  key={c.crm_contact_id}
                  href={`/lab/env/${params.envId}/consulting/contacts/${c.crm_contact_id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1.4fr 1fr 1.5fr 0.7fr 0.6fr",
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    fontSize: 13,
                    color: "#dce6f0",
                    textDecoration: "none",
                    transition: "background 80ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.full_name}</span>
                  <span style={{ color: "rgba(220,230,240,0.72)" }}>
                    {c.account_name ?? <span style={{ color: "rgba(220,230,240,0.30)" }}>—</span>}
                    {c.vertical ? <span style={{ color: "rgba(220,230,240,0.30)", marginLeft: 6, fontSize: 11 }}>· {c.vertical}</span> : null}
                    {!c.crm_account_id ? <span style={{ color: "rgba(220,230,240,0.25)", marginLeft: 6, fontSize: 10 }}>unlinked</span> : null}
                  </span>
                  <span style={{ color: "rgba(220,230,240,0.72)" }}>{c.title ?? "—"}</span>
                  <span style={{ color: "rgba(220,230,240,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.email ?? "—"}
                  </span>
                  <span>
                    {c.relationship_strength ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 2,
                          fontSize: 10,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: tone.color,
                          background: tone.bg,
                          border: `1px solid ${tone.color}33`,
                        }}
                      >
                        {c.relationship_strength}
                      </span>
                    ) : (
                      <span style={{ color: "rgba(220,230,240,0.30)" }}>—</span>
                    )}
                  </span>
                  <span style={{ color: "rgba(220,230,240,0.50)", fontSize: 11 }}>
                    {fmtRelDate(c.last_outreach_at)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(5,7,11,0.8)",
  color: "#dce6f0",
  fontSize: 13,
  outline: "none",
};
const selectStyle: React.CSSProperties = { ...inputStyle, fontFamily: "inherit" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 13 }}>
      <span
        style={{
          display: "block",
          fontSize: 10,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: "rgba(220,230,240,0.42)",
          marginBottom: 4,
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}
