"use client";

import { useState } from "react";

const FG_1 = "#E6EDF7";
const FG_2 = "#A9B4C4";
const FG_3 = "#6B7891";
const BORDER = "rgba(105, 120, 145, 0.25)";
const BORDER_FOCUS = "rgba(0, 229, 255, 0.5)";
const PANEL_BG = "#0A0E14";

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "94vw",
          height: "100%",
          background: PANEL_BG,
          borderLeft: "2px solid #00E5FF",
          padding: 20,
          overflowY: "auto",
          fontFamily: "var(--font-plex-sans)",
          color: FG_1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
      <h2
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: FG_2,
          fontFamily: "var(--font-jetbrains-mono)",
        }}
      >
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: "transparent",
          border: `1px solid ${BORDER}`,
          color: FG_2,
          width: 28,
          height: 28,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: FG_3,
        marginBottom: 4,
        fontFamily: "var(--font-jetbrains-mono)",
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#05070B",
  border: `1px solid ${BORDER}`,
  color: FG_1,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "var(--font-plex-sans)",
  outline: "none",
};

const buttonPrimary: React.CSSProperties = {
  background: "#00E5FF",
  color: "#05070B",
  border: "none",
  padding: "10px 16px",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-jetbrains-mono)",
};

const buttonSecondary: React.CSSProperties = {
  background: "transparent",
  color: FG_2,
  border: `1px solid ${BORDER}`,
  padding: "10px 16px",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "var(--font-jetbrains-mono)",
};

// ── Engagement Create Drawer ───────────────────────────────────────────────

export function EngagementCreateDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    client_name: "",
    name: "",
    contracting_entity: "Novendor LLC",
    originated_by_user_id: "paul",
    relationship_owner_user_id: "paul",
    delivery_owner_user_id: "paul",
    engagement_type: "advisory",
    routing_status: "routing_review",
    next_action_text: "",
    next_action_due_date: "",
    lead_source: "inbound",
    current_pain: "",
    what_winston_replaces: "",
    expected_roi_angle: "",
    marketing_permission_status: "unknown",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.client_name.trim() || !form.name.trim()) {
      setError("Client and engagement name required.");
      return;
    }
    // Next action is encouraged but never required — operators can move
    // engagements without it. Missing next action shows as a health signal
    // on the card instead.
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        next_action_due_date: form.next_action_due_date || null,
        next_action_text: form.next_action_text || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <DrawerHeader title="New Engagement" onClose={onClose} />
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div>
          <Label>Client Name *</Label>
          <input style={inputStyle} value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
        </div>
        <div>
          <Label>Engagement Name *</Label>
          <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Contracting Entity</Label>
            <input style={inputStyle} value={form.contracting_entity} onChange={(e) => set("contracting_entity", e.target.value)} />
          </div>
          <div>
            <Label>Engagement Type</Label>
            <select style={inputStyle} value={form.engagement_type} onChange={(e) => set("engagement_type", e.target.value)}>
              {["strategy", "implementation", "audit", "retainer", "training", "workshop", "other", "advisory"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <Label>Originated By</Label>
            <input style={inputStyle} value={form.originated_by_user_id} onChange={(e) => set("originated_by_user_id", e.target.value)} />
          </div>
          <div>
            <Label>Relationship Owner</Label>
            <input style={inputStyle} value={form.relationship_owner_user_id} onChange={(e) => set("relationship_owner_user_id", e.target.value)} />
          </div>
          <div>
            <Label>Delivery Owner</Label>
            <input style={inputStyle} value={form.delivery_owner_user_id} onChange={(e) => set("delivery_owner_user_id", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Routing Status</Label>
            <select style={inputStyle} value={form.routing_status} onChange={(e) => set("routing_status", e.target.value)}>
              {["draft", "routing_review", "active", "paused", "renewal_risk", "closed", "lost"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Lead Source</Label>
            <select style={inputStyle} value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)}>
              {["inbound", "referral", "personal_network", "outbound", "partner_originated", "existing_relationship", "marketplace", "other"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>Next Action</Label>
          <input style={inputStyle} value={form.next_action_text} onChange={(e) => set("next_action_text", e.target.value)} placeholder="What needs to happen next?" />
        </div>
        <div>
          <Label>Next Action Due Date</Label>
          <input type="date" style={inputStyle} value={form.next_action_due_date} onChange={(e) => set("next_action_due_date", e.target.value)} />
        </div>
        <div>
          <Label>Current Pain</Label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.current_pain} onChange={(e) => set("current_pain", e.target.value)} />
        </div>
        <div>
          <Label>What Winston Replaces</Label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={form.what_winston_replaces} onChange={(e) => set("what_winston_replaces", e.target.value)} />
        </div>
        <div>
          <Label>Expected ROI Angle</Label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={form.expected_roi_angle} onChange={(e) => set("expected_roi_angle", e.target.value)} />
        </div>
        {error && <div style={{ color: "#FF3B5C", fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" disabled={submitting} style={buttonPrimary}>
            {submitting ? "Saving..." : "Save Engagement"}
          </button>
          <button type="button" onClick={onClose} style={buttonSecondary}>
            Cancel
          </button>
        </div>
      </form>
    </Backdrop>
  );
}

// ── Contract Drawer ──────────────────────────────────────────────────────

export function ContractDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    contract_type: "SOW",
    status: "draft",
    signed_by_client: false,
    signed_by_novendor: false,
    effective_date: "",
    file_url: "",
    billing_terms: "net_30",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);
    try {
      const status =
        form.signed_by_client && form.signed_by_novendor
          ? "fully_signed"
          : form.signed_by_client || form.signed_by_novendor
            ? "partially_signed"
            : form.status;
      await onSubmit({
        ...form,
        status,
        effective_date: form.effective_date || null,
        file_url: form.file_url || null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <DrawerHeader title="Add Contract" onClose={onClose} />
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Contract Type</Label>
            <select style={inputStyle} value={form.contract_type} onChange={(e) => set("contract_type", e.target.value)}>
              {["MSA", "SOW", "amendment", "contractor_agreement", "subcontractor_agreement", "NDA", "other"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Effective Date</Label>
            <input type="date" style={inputStyle} value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: FG_1, fontSize: 12 }}>
            <input type="checkbox" checked={form.signed_by_client} onChange={(e) => set("signed_by_client", e.target.checked)} />
            Signed by client
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: FG_1, fontSize: 12 }}>
            <input type="checkbox" checked={form.signed_by_novendor} onChange={(e) => set("signed_by_novendor", e.target.checked)} />
            Signed by Novendor
          </label>
        </div>
        <div>
          <Label>Billing Terms</Label>
          <input style={inputStyle} value={form.billing_terms} onChange={(e) => set("billing_terms", e.target.value)} />
        </div>
        <div>
          <Label>File URL</Label>
          <input style={inputStyle} value={form.file_url} onChange={(e) => set("file_url", e.target.value)} placeholder="https://..." />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={submitting} style={buttonPrimary}>{submitting ? "Saving..." : "Save Contract"}</button>
          <button type="button" onClick={onClose} style={buttonSecondary}>Cancel</button>
        </div>
      </form>
    </Backdrop>
  );
}

// ── Revenue Stream Drawer ──────────────────────────────────────────────────

export function RevenueStreamDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    revenue_type: "fixed",
    total_contract_value: "",
    hourly_rate: "",
    estimated_hours: "",
    retainer_amount: "",
    billing_frequency: "milestone",
    paul_split: "0.5",
    rich_split: "0.5",
    revenue_notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const splitTotal = (Number(form.paul_split) || 0) + (Number(form.rich_split) || 0);
  const splitWarning = splitTotal && Math.abs(splitTotal - 1.0) > 0.001 ? `Split totals ${splitTotal.toFixed(2)}, expected 1.00` : null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        revenue_type: form.revenue_type,
        total_contract_value: form.total_contract_value ? Number(form.total_contract_value) : null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        retainer_amount: form.retainer_amount ? Number(form.retainer_amount) : null,
        billing_frequency: form.billing_frequency,
        margin_split_json: {
          paul: Number(form.paul_split) || 0,
          rich: Number(form.rich_split) || 0,
        },
        revenue_notes: form.revenue_notes || null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <DrawerHeader title="Define Revenue Stream" onClose={onClose} />
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Type</Label>
            <select style={inputStyle} value={form.revenue_type} onChange={(e) => set("revenue_type", e.target.value)}>
              {["fixed", "hourly", "retainer", "milestone", "success_fee", "hybrid"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Frequency</Label>
            <select style={inputStyle} value={form.billing_frequency} onChange={(e) => set("billing_frequency", e.target.value)}>
              {["once", "weekly", "monthly", "quarterly", "milestone", "ad_hoc"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Total Contract Value</Label>
            <input style={inputStyle} type="number" step="0.01" value={form.total_contract_value} onChange={(e) => set("total_contract_value", e.target.value)} />
          </div>
          <div>
            <Label>Retainer Amount</Label>
            <input style={inputStyle} type="number" step="0.01" value={form.retainer_amount} onChange={(e) => set("retainer_amount", e.target.value)} />
          </div>
          <div>
            <Label>Hourly Rate</Label>
            <input style={inputStyle} type="number" step="0.01" value={form.hourly_rate} onChange={(e) => set("hourly_rate", e.target.value)} />
          </div>
          <div>
            <Label>Estimated Hours</Label>
            <input style={inputStyle} type="number" step="0.01" value={form.estimated_hours} onChange={(e) => set("estimated_hours", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Economics Split (must total 1.00)</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <input style={inputStyle} type="number" step="0.01" min="0" max="1" value={form.paul_split} onChange={(e) => set("paul_split", e.target.value)} />
              <div style={{ fontSize: 9, color: FG_3, marginTop: 4 }}>paul</div>
            </div>
            <div>
              <input style={inputStyle} type="number" step="0.01" min="0" max="1" value={form.rich_split} onChange={(e) => set("rich_split", e.target.value)} />
              <div style={{ fontSize: 9, color: FG_3, marginTop: 4 }}>rich</div>
            </div>
          </div>
          {splitWarning && <div style={{ color: "#FFB020", fontSize: 11, marginTop: 6, fontFamily: "var(--font-jetbrains-mono)" }}>{splitWarning}</div>}
        </div>
        <div>
          <Label>Notes</Label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={form.revenue_notes} onChange={(e) => set("revenue_notes", e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={submitting} style={buttonPrimary}>{submitting ? "Saving..." : "Save Revenue Stream"}</button>
          <button type="button" onClick={onClose} style={buttonSecondary}>Cancel</button>
        </div>
      </form>
    </Backdrop>
  );
}

// ── Invoice Drawer ─────────────────────────────────────────────────────────

export function InvoiceDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    invoice_number: "",
    amount: "",
    issued_date: "",
    due_date: "",
    paid_date: "",
    status: "draft",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.amount) return;
    setSubmitting(true);
    try {
      await onSubmit({
        invoice_number: form.invoice_number || null,
        amount: Number(form.amount),
        issued_date: form.issued_date || null,
        due_date: form.due_date || null,
        paid_date: form.paid_date || null,
        status: form.status,
        notes: form.notes || null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <DrawerHeader title="Add Invoice" onClose={onClose} />
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Invoice Number</Label>
            <input style={inputStyle} value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} />
          </div>
          <div>
            <Label>Amount *</Label>
            <input style={inputStyle} type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} required />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Issued Date</Label>
            <input style={inputStyle} type="date" value={form.issued_date} onChange={(e) => set("issued_date", e.target.value)} />
          </div>
          <div>
            <Label>Due Date</Label>
            <input style={inputStyle} type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Status</Label>
            <select style={inputStyle} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {["draft", "scheduled", "invoiced", "paid", "overdue", "written_off"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Paid Date</Label>
            <input style={inputStyle} type="date" value={form.paid_date} onChange={(e) => set("paid_date", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={submitting} style={buttonPrimary}>{submitting ? "Saving..." : "Save Invoice"}</button>
          <button type="button" onClick={onClose} style={buttonSecondary}>Cancel</button>
        </div>
      </form>
    </Backdrop>
  );
}

// ── Attribution Drawer ─────────────────────────────────────────────────────

export function AttributionDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    operator_name: "paul",
    user_id: "paul",
    role: "originator",
    credit_percentage: "1.0",
    economics_percentage: "0.5",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        operator_name: form.operator_name || null,
        user_id: form.user_id || null,
        role: form.role,
        credit_percentage: form.credit_percentage ? Number(form.credit_percentage) : null,
        economics_percentage: form.economics_percentage ? Number(form.economics_percentage) : null,
        notes: form.notes || null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <DrawerHeader title="Add Attribution" onClose={onClose} />
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Operator</Label>
            <input style={inputStyle} value={form.operator_name} onChange={(e) => set("operator_name", e.target.value)} />
          </div>
          <div>
            <Label>User Id</Label>
            <input style={inputStyle} value={form.user_id} onChange={(e) => set("user_id", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Role</Label>
          <select style={inputStyle} value={form.role} onChange={(e) => set("role", e.target.value)}>
            {["originator", "seller", "relationship_owner", "delivery_owner", "delivery_support", "partner", "admin_support"].map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Credit %</Label>
            <input style={inputStyle} type="number" step="0.01" min="0" max="1" value={form.credit_percentage} onChange={(e) => set("credit_percentage", e.target.value)} />
          </div>
          <div>
            <Label>Economics %</Label>
            <input style={inputStyle} type="number" step="0.01" min="0" max="1" value={form.economics_percentage} onChange={(e) => set("economics_percentage", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={submitting} style={buttonPrimary}>{submitting ? "Saving..." : "Save Attribution"}</button>
          <button type="button" onClick={onClose} style={buttonSecondary}>Cancel</button>
        </div>
      </form>
    </Backdrop>
  );
}
