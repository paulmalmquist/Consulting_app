"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { createManualDeal, type PipelineStage } from "@/lib/cro-api";
import { VERTICAL_ORDER } from "@/components/consulting/pipeline-verticals";

const FG_1 = "#E6EDF7";
const FG_2 = "#A9B4C4";
const FG_3 = "#6B7891";
const BORDER = "rgba(105, 120, 145, 0.25)";
const PANEL_BG = "#0A0E14";

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#05070B",
  border: `1px solid ${BORDER}`,
  color: FG_1,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "var(--font-plex-sans)",
  outline: "none",
};

const buttonPrimary: CSSProperties = {
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

const buttonSecondary: CSSProperties = {
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

function Backdrop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.65)",
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "100vw",
          height: "100%",
          background: PANEL_BG,
          borderLeft: "2px solid #00E5FF",
          padding: 24,
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
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 18,
        paddingBottom: 12,
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <div>
        <div style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: FG_2, fontFamily: "var(--font-jetbrains-mono)", fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: FG_3, marginTop: 4 }}>Create a new deal and assign the first next action.</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: "transparent",
          border: `1px solid ${BORDER}`,
          color: FG_2,
          width: 32,
          height: 32,
          fontSize: 16,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: FG_3,
        marginBottom: 6,
        fontFamily: "var(--font-jetbrains-mono)",
      }}
    >
      {children}
    </div>
  );
}

const DEFAULT_STAGE_OPTIONS = [
  { key: "identified", label: "Identified" },
  { key: "contacted", label: "Contacted" },
  { key: "engaged", label: "Engaged" },
  { key: "meeting", label: "Meeting" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
];

const OFFER_OPTIONS = [
  "Transformation",
  "Advisory",
  "Managed Services",
  "Retainer",
  "Workshop",
  "Proof of Concept",
  "Other",
];

const ACTION_TYPES = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "proposal", label: "Proposal" },
  { value: "task", label: "Task" },
];

export default function AddDealDrawer({
  envId,
  businessId,
  stages,
  onClose,
  onCreated,
}: {
  envId: string;
  businessId: string;
  stages: PipelineStage[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState({
    account_name: "",
    account_industry: "",
    account_website: "",
    contact_name: "",
    contact_email: "",
    contact_title: "",
    contact_linkedin: "",
    name: "",
    amount: "",
    stage_key: stages.length > 0 ? stages[0].key : DEFAULT_STAGE_OPTIONS[0].key,
    expected_close_date: "",
    next_action_description: "",
    next_action_due: "",
    next_action_type: "meeting",
    offer: "Transformation",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageOptions = stages.length > 0 ? stages : DEFAULT_STAGE_OPTIONS;
  const verticalOptions = ["", ...VERTICAL_ORDER];

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.account_name.trim()) {
      setError("Account name is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Deal name is required.");
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      setError("Deal amount must be a positive number.");
      return;
    }
    if (!form.contact_name.trim()) {
      setError("Primary contact name is required.");
      return;
    }
    if (!form.next_action_description.trim()) {
      setError("Next action description is required.");
      return;
    }
    if (!form.next_action_due) {
      setError("Next action due date is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await createManualDeal({
        env_id: envId,
        business_id: businessId,
        account_name: form.account_name.trim(),
        account_industry: form.account_industry || null,
        account_website: form.account_website || null,
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email || null,
        contact_title: form.contact_title || null,
        contact_linkedin: form.contact_linkedin || null,
        name: form.name.trim(),
        amount,
        stage_key: form.stage_key,
        expected_close_date: form.expected_close_date || null,
        next_action_description: form.next_action_description.trim(),
        next_action_due: form.next_action_due,
        next_action_type: form.next_action_type,
        offer: form.offer || null,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <DrawerHeader title="Add Deal" onClose={onClose} />
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <Label>Deal Name *</Label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="Opportunity name"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Stage *</Label>
              <select
                style={inputStyle}
                value={form.stage_key}
                onChange={(event) => setField("stage_key", event.target.value)}
              >
                {stageOptions.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Offer</Label>
              <select
                style={inputStyle}
                value={form.offer}
                onChange={(event) => setField("offer", event.target.value)}
              >
                {OFFER_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Amount *</Label>
              <input
                type="number"
                min="0"
                step="0.01"
                style={inputStyle}
                value={form.amount}
                onChange={(event) => setField("amount", event.target.value)}
                placeholder="50000"
              />
            </div>
            <div>
              <Label>Expected close</Label>
              <input
                type="date"
                style={inputStyle}
                value={form.expected_close_date}
                onChange={(event) => setField("expected_close_date", event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Vertical</Label>
            <select
              style={inputStyle}
              value={form.account_industry}
              onChange={(event) => setField("account_industry", event.target.value)}
            >
              {verticalOptions.map((vertical) => (
                <option key={vertical} value={vertical === "" ? "" : vertical}>
                  {vertical === "" ? "Select vertical" : vertical}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Account</Label>
            <input
              style={inputStyle}
              value={form.account_name}
              onChange={(event) => setField("account_name", event.target.value)}
              placeholder="Client company"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Website</Label>
              <input
                style={inputStyle}
                value={form.account_website}
                onChange={(event) => setField("account_website", event.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <Label>Contact *</Label>
              <input
                style={inputStyle}
                value={form.contact_name}
                onChange={(event) => setField("contact_name", event.target.value)}
                placeholder="Primary contact"
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Email</Label>
              <input
                type="email"
                style={inputStyle}
                value={form.contact_email}
                onChange={(event) => setField("contact_email", event.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div>
              <Label>Title</Label>
              <input
                style={inputStyle}
                value={form.contact_title}
                onChange={(event) => setField("contact_title", event.target.value)}
                placeholder="Title"
              />
            </div>
          </div>
          <div>
            <Label>LinkedIn</Label>
            <input
              style={inputStyle}
                value={form.contact_linkedin}
                onChange={(event) => setField("contact_linkedin", event.target.value)}
                placeholder="https://linkedin.com/in/name"
              />
          </div>
          <div>
            <Label>Next action *</Label>
            <input
              style={inputStyle}
              value={form.next_action_description}
              onChange={(event) => setField("next_action_description", event.target.value)}
              placeholder="What needs to happen next?"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Due date *</Label>
              <input
                type="date"
                style={inputStyle}
                value={form.next_action_due}
                onChange={(event) => setField("next_action_due", event.target.value)}
              />
            </div>
            <div>
              <Label>Action type</Label>
              <select
                style={inputStyle}
                value={form.next_action_type}
                onChange={(event) => setField("next_action_type", event.target.value)}
              >
                {ACTION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error ? <div style={{ color: "#FF3B5C", fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={submitting} style={buttonPrimary}>
            {submitting ? "Saving..." : "Create Deal"}
          </button>
          <button type="button" onClick={onClose} style={buttonSecondary}>
            Cancel
          </button>
        </div>
      </form>
    </Backdrop>
  );
}
