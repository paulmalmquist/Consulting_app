"use client";

import { useEffect, useRef, useState } from "react";
import type { LabCapabilityMeta } from "@/lib/lab/CapabilityRegistry";

type Props = {
  availableCapabilities: LabCapabilityMeta[];
  onAdd: (capKey: string) => void;
};

export default function AddCapabilityMenu({ availableCapabilities, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!availableCapabilities.length) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="add-cap-button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg border border-dashed border-bm-border/70 px-2.5 py-1.5 text-xs text-bm-muted hover:border-bm-accent/40 hover:text-bm-text transition inline-flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span> Capability
      </button>
      {open && (
        <div
          data-testid="add-cap-menu"
          className="absolute top-full left-0 z-50 mt-1 w-56 max-h-64 overflow-y-auto rounded-lg border border-bm-border/70 bg-bm-bg/95 shadow-lg backdrop-blur-sm"
        >
          {availableCapabilities.map((cap) => (
            <button
              key={cap.key}
              type="button"
              data-testid={`add-cap-item-${cap.key}`}
              onClick={() => {
                onAdd(cap.key);
                setOpen(false);
              }}
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-bm-surface/50 transition first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-sm text-bm-text">{cap.label}</span>
              <span className="text-xs text-bm-muted">{cap.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
