"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

type FundDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundName: string;
  onConfirm: () => Promise<void> | void;
  deleting?: boolean;
  investmentCount?: number;
  assetCount?: number;
};

export function FundDeleteDialog({
  open,
  onOpenChange,
  fundName,
  onConfirm,
  deleting = false,
  investmentCount,
  assetCount,
}: FundDeleteDialogProps) {
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedName("");
    }
  }, [open]);

  const countsLine = useMemo(() => {
    const bits = [
      typeof investmentCount === "number" ? `${investmentCount} investment${investmentCount === 1 ? "" : "s"}` : null,
      typeof assetCount === "number" ? `${assetCount} asset${assetCount === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return bits.length > 0 ? bits.join(" and ") : null;
  }, [assetCount, investmentCount]);

  const canDelete = typedName.trim() === fundName.trim() && !deleting;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Fund"
      description="This permanently deletes the fund and removes or detaches orphaned investment analytics tied to it."
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={!canDelete}
          >
            {deleting ? "Deleting..." : "Delete Fund"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          <p className="font-medium">This action cannot be undone.</p>
          {countsLine ? (
            <p className="mt-1 text-bm-muted">
              The delete flow will remove the fund, {countsLine}, and related quarter-state analytics.
            </p>
          ) : (
            <p className="mt-1 text-bm-muted">
              The delete flow will remove the fund and related quarter-state analytics.
            </p>
          )}
        </div>

        <label className="block text-sm">
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Type fund name to confirm
          </span>
          <input
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={fundName}
            className="mt-2 w-full rounded-md border border-bm-border/40 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text outline-none transition-colors focus:border-bm-danger/40"
            autoFocus
          />
        </label>
      </div>
    </Dialog>
  );
}
