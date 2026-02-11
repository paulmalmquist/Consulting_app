"use client";

import { useState } from "react";
import type { Deal, DealStage } from "@/lib/deals";
import { DEAL_STAGES } from "@/lib/deals";

type Props = {
  onAdd: (deal: Omit<Deal, "id" | "createdAt">) => void;
  onClose: () => void;
};

const EMPTY = {
  name: "",
  company: "",
  value: "",
  stage: "origination" as DealStage,
  owner: "",
  probability: "50",
};

export default function AddDealModal({ onAdd, onClose }: Props) {
  const [form, setForm] = useState(EMPTY);

  const canSave = form.name.trim() && form.company.trim() && Number(form.value) > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    onAdd({
      name: form.name.trim(),
      company: form.company.trim(),
      value: Number(form.value),
      stage: form.stage,
      owner: form.owner.trim() || "Unassigned",
      probability: Math.min(100, Math.max(0, Number(form.probability) || 50)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg rounded-xl border border-bm-border/70 bg-bm-bg p-6"
        data-testid="add-deal-modal"
      >
        <h3 className="mb-4 text-lg font-semibold text-bm-text">Add Deal</h3>
        <div className="space-y-3">
          <input
            placeholder="Deal Name *"
            value={form.name}
            data-testid="deal-name-input"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
          />
          <input
            placeholder="Company *"
            value={form.company}
            data-testid="deal-company-input"
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              placeholder="Value ($) *"
              value={form.value}
              data-testid="deal-value-input"
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
            />
            <input
              type="number"
              placeholder="Probability %"
              value={form.probability}
              min={0}
              max={100}
              onChange={(e) => setForm({ ...form, probability: e.target.value })}
              className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.stage}
              data-testid="deal-stage-select"
              onChange={(e) =>
                setForm({ ...form, stage: e.target.value as DealStage })
              }
              className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text"
            >
              {DEAL_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Owner"
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-bm-border/70 px-4 py-2 text-sm text-bm-muted hover:text-bm-text transition"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-deal-button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm text-bm-text hover:bg-bm-accent/20 transition disabled:opacity-40"
          >
            Save Deal
          </button>
        </div>
      </div>
    </div>
  );
}
