"use client";

import { useEffect, useRef, useState } from "react";
import { DeptIcon } from "@/components/lab/LabIcons";
import type { LabDepartmentMeta } from "@/lib/lab/DepartmentRegistry";

type Props = {
  availableDepartments: LabDepartmentMeta[];
  onAdd: (deptKey: string) => void;
};

export default function AddDepartmentMenu({ availableDepartments, onAdd }: Props) {
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

  if (!availableDepartments.length) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="add-dept-button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg border border-dashed border-bm-border/70 px-2.5 py-1.5 text-xs text-bm-muted hover:border-bm-accent/40 hover:text-bm-text transition inline-flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span> Dept
      </button>
      {open && (
        <div
          data-testid="add-dept-menu"
          className="absolute top-full left-0 z-50 mt-1 w-48 rounded-lg border border-bm-border/70 bg-bm-bg/95 shadow-lg backdrop-blur-sm"
        >
          {availableDepartments.map((dept) => (
            <button
              key={dept.key}
              type="button"
              data-testid={`add-dept-item-${dept.key}`}
              onClick={() => {
                onAdd(dept.key);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text transition first:rounded-t-lg last:rounded-b-lg"
            >
              <DeptIcon deptKey={dept.key} size={14} />
              <span>{dept.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
