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
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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
        className="rounded-lg border border-dashed border-bm-border/70 px-2.5 py-1.5 text-xs text-bm-muted transition hover:border-bm-accent/40 hover:text-bm-text inline-flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span> Capability
      </button>
      {open ? (
        <div
          data-testid="add-cap-menu"
          className="absolute right-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-bm-border/70 bg-bm-bg/95 shadow-lg backdrop-blur-sm"
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
              className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-bm-surface/50 first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-sm text-bm-text">{cap.label}</span>
              <span className="text-xs text-bm-muted">{cap.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
