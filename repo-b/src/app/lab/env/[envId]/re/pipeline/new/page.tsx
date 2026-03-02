"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { bosFetch } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

/* ------------------------------------------------------------------ */
/* Options                                                              */
/* ------------------------------------------------------------------ */
const STRATEGY_OPTIONS = [
  { value: "", label: "Select strategy..." },
  { value: "core", label: "Core" },
  { value: "core_plus", label: "Core Plus" },
  { value: "value_add", label: "Value Add" },
  { value: "opportunistic", label: "Opportunistic" },
  { value: "debt", label: "Debt" },
  { value: "development", label: "Development" },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: "", label: "Select type..." },
  { value: "multifamily", label: "Multifamily" },
  { value: "office", label: "Office" },
  { value: "industrial", label: "Industrial" },
  { value: "retail", label: "Retail" },
  { value: "hospitality", label: "Hospitality" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export default function NewDealPage() {
  const { envId } = useReEnv();
  const router = useRouter();

  const [form, setForm] = useState({
    deal_name: "",
    strategy: "",
    property_type: "",
    source: "",
    headline_price: "",
    target_irr: "",
    target_moic: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.deal_name.trim()) {
      setError("Deal name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        deal_name: form.deal_name.trim(),
      };
      if (form.strategy) payload.strategy = form.strategy;
      if (form.property_type) payload.property_type = form.property_type;
      if (form.source) payload.source = form.source.trim();
      if (form.headline_price) payload.headline_price = Number(form.headline_price);
      if (form.target_irr) payload.target_irr = Number(form.target_irr);
      if (form.target_moic) payload.target_moic = Number(form.target_moic);
      if (form.notes) payload.notes = form.notes.trim();

      const created = await bosFetch<{ deal_id: string }>(
        "/api/re/v2/pipeline/deals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          params: { env_id: envId },
        },
      );
      router.push(`/lab/env/${envId}/re/pipeline/${created.deal_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header */}
      <Link
        href={`/lab/env/${envId}/re/pipeline`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-bm-muted hover:text-bm-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Pipeline
      </Link>
      <h1 className="mb-6 text-lg font-semibold text-bm-text">Create New Deal</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Deal Name */}
        <FieldGroup label="Deal Name" required>
          <input
            type="text"
            value={form.deal_name}
            onChange={(e) => updateField("deal_name", e.target.value)}
            placeholder="e.g. Sunrise Apartments Acquisition"
            className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
          />
        </FieldGroup>

        {/* Strategy + Property Type (side by side) */}
        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Strategy">
            <select
              value={form.strategy}
              onChange={(e) => updateField("strategy", e.target.value)}
              className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text focus:border-bm-accent focus:outline-none"
            >
              {STRATEGY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Property Type">
            <select
              value={form.property_type}
              onChange={(e) => updateField("property_type", e.target.value)}
              className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text focus:border-bm-accent focus:outline-none"
            >
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FieldGroup>
        </div>

        {/* Source */}
        <FieldGroup label="Source">
          <input
            type="text"
            value={form.source}
            onChange={(e) => updateField("source", e.target.value)}
            placeholder="e.g. CBRE, JLL, Off-market"
            className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
          />
        </FieldGroup>

        {/* Price / IRR / MOIC (side by side) */}
        <div className="grid grid-cols-3 gap-4">
          <FieldGroup label="Headline Price ($)">
            <input
              type="number"
              step="any"
              value={form.headline_price}
              onChange={(e) => updateField("headline_price", e.target.value)}
              placeholder="e.g. 42500000"
              className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
            />
          </FieldGroup>

          <FieldGroup label="Target IRR (%)">
            <input
              type="number"
              step="any"
              value={form.target_irr}
              onChange={(e) => updateField("target_irr", e.target.value)}
              placeholder="e.g. 15.2"
              className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
            />
          </FieldGroup>

          <FieldGroup label="Target MOIC (x)">
            <input
              type="number"
              step="any"
              value={form.target_moic}
              onChange={(e) => updateField("target_moic", e.target.value)}
              placeholder="e.g. 1.85"
              className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
            />
          </FieldGroup>
        </div>

        {/* Notes */}
        <FieldGroup label="Notes">
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Additional context, key considerations..."
            className="w-full resize-y rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:border-bm-accent focus:outline-none"
          />
        </FieldGroup>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/lab/env/${envId}/re/pipeline`}
            className="rounded-lg border border-bm-border px-4 py-2 text-sm font-medium text-bm-muted hover:bg-bm-surface"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Create Deal
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field wrapper                                                        */
/* ------------------------------------------------------------------ */
function FieldGroup({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-bm-muted">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
