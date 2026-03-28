"use client";

import React, { useState } from "react";
import type { TradingPosition } from "@/lib/trading-lab/types";

interface Props {
  open: boolean;
  position: TradingPosition | null;
  onClose: () => void;
  onUpdated: () => void;
  theme: any; // buildTheme() returns nested object with chart sub-object
}

export function EditPositionModal({ open, position, onClose, onUpdated, theme: t }: Props) {
  const [stopLoss, setStopLoss] = useState(position?.stop_loss?.toString() ?? "");
  const [takeProfit, setTakeProfit] = useState(position?.take_profit?.toString() ?? "");
  const [notes, setNotes] = useState(position?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open || !position) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body: Record<string, unknown> = {};
      if (stopLoss) body.stop_loss = parseFloat(stopLoss);
      if (takeProfit) body.take_profit = parseFloat(takeProfit);
      if (notes !== (position.notes ?? "")) body.notes = notes;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(
        `/api/v1/trading/positions?id=${position.position_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onUpdated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update position");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-lg shadow-xl w-full max-w-md p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>
            Edit {position.ticker} {position.direction.toUpperCase()}
          </h2>
          <button onClick={onClose} className={`${t.textMuted} text-xl leading-none`}>
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-500/20 text-red-400 text-xs rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Stop Loss</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder={position.stop_loss?.toString() ?? "Not set"}
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Take Profit</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder={position.take_profit?.toString() ?? "Not set"}
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
          </div>

          <div>
            <label className={`block mb-1 ${t.textSecondary}`}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded text-sm border ${t.cardBorder} ${t.textSecondary}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
