"use client";

import React, { useMemo, useState } from "react";
import type { TradingPosition } from "@/lib/trading-lab/types";

interface Props {
  open: boolean;
  position: TradingPosition | null;
  onClose: () => void;
  onClosed: () => void;
  theme: any; // buildTheme() returns nested object with chart sub-object
}

export function ClosePositionModal({ open, position, onClose, onClosed, theme: t }: Props) {
  const [exitPrice, setExitPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const ep = parseFloat(exitPrice);
    if (!ep || !position) return null;
    const dirMult = position.direction === "long" ? 1 : -1;
    const pnl = (ep - position.entry_price) * position.size * dirMult;
    const notional = position.notional || 1;
    const returnPct = (pnl / notional) * 100;
    return { pnl, returnPct };
  }, [exitPrice, position]);

  if (!open || !position) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const ep = parseFloat(exitPrice);
    if (!ep) {
      setError("Exit price is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/trading/positions/${position.position_id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exit_price: ep }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onClosed();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to close position");
    } finally {
      setSaving(false);
    }
  };

  const pnlColor = preview
    ? preview.pnl >= 0
      ? "text-green-400"
      : "text-red-400"
    : t.textMuted;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-lg shadow-xl w-full max-w-md p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>
            Close {position.ticker} {position.direction.toUpperCase()}
          </h2>
          <button onClick={onClose} className={`${t.textMuted} text-xl leading-none`}>
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-500/20 text-red-400 text-xs rounded">{error}</div>
        )}

        {/* Position summary */}
        <div className={`mb-4 p-3 rounded border ${t.cardBorder} ${t.statBarBg} text-xs`}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={t.textMuted}>Entry:</span>{" "}
              <span className={t.textPrimary}>${position.entry_price?.toFixed(2)}</span>
            </div>
            <div>
              <span className={t.textMuted}>Size:</span>{" "}
              <span className={t.textPrimary}>{position.size}</span>
            </div>
            <div>
              <span className={t.textMuted}>Notional:</span>{" "}
              <span className={t.textPrimary}>${position.notional?.toFixed(2)}</span>
            </div>
            <div>
              <span className={t.textMuted}>Direction:</span>{" "}
              <span className={position.direction === "long" ? "text-green-400" : "text-red-400"}>
                {position.direction.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className={`block mb-1 ${t.textSecondary}`}>Exit Price</label>
            <input
              type="number"
              step="any"
              autoFocus
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
            />
          </div>

          {/* PnL Preview */}
          {preview && (
            <div className={`p-3 rounded border ${t.cardBorder} ${t.statBarBg}`}>
              <div className="flex justify-between text-xs">
                <span className={t.textMuted}>Realized P&L:</span>
                <span className={`font-bold ${pnlColor}`}>
                  {preview.pnl >= 0 ? "+" : ""}${preview.pnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className={t.textMuted}>Return:</span>
                <span className={pnlColor}>
                  {preview.returnPct >= 0 ? "+" : ""}{preview.returnPct.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

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
              className={`px-4 py-2 rounded text-sm text-white disabled:opacity-50 ${
                preview && preview.pnl >= 0
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {saving ? "Closing..." : "Close Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
