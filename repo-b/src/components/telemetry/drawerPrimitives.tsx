"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { C } from "./primitives";

// Desktop drawer width is user-resizable (drag the left edge) and persisted. Clamped so it can never
// cover the whole screen or shrink below the legible default. Mobile (bottom sheet) ignores width.
const DRAWER_MIN_W = 460;
const DRAWER_DEFAULT_W = 460;
const DRAWER_WIDTH_KEY = "telemetry.drawerWidth";

function drawerMaxW(): number {
  if (typeof window === "undefined") return 1100;
  return Math.max(DRAWER_MIN_W, Math.round(window.innerWidth * 0.9));
}
function clampDrawerW(w: number): number {
  return Math.min(drawerMaxW(), Math.max(DRAWER_MIN_W, Math.round(w)));
}

// ===========================================================================
// Shared right/bottom drawer primitives (Radix Dialog). Both metadata drawers
// duplicated this Portal/Overlay/Content + header + field-row boilerplate. The
// contract is preserved exactly: right-open on lg / bottom sheet on mobile,
// close-on-Escape + overlay click via Dialog.Root, focus trap via Radix, and an
// explicit close control. Geometry/responsive layout stays in literal classes.
// ---------------------------------------------------------------------------

function isPresent(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

// Fail-closed 2-column field row: a missing value renders "Not available", never blank.
export function FieldRow({ label, value }: { label: string; value: unknown }) {
  const present = isPresent(value);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,0.8fr) minmax(0,1.5fr)", gap: 12,
      padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: present ? C.dim : C.faint, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5, overflowWrap: "anywhere" }}>
        {present ? String(value) : "Not available"}
      </div>
    </div>
  );
}

// Drawer title + description + close control (Radix Title/Description/Close).
export function DrawerHeader({ title, description, closeLabel = "Close" }: {
  title: ReactNode; description?: ReactNode; closeLabel?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <Dialog.Title style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 700, overflowWrap: "anywhere" }}>
          {title}
        </Dialog.Title>
        {description != null && (
          <Dialog.Description style={{ color: C.dim, fontFamily: C.mono, fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
            {description}
          </Dialog.Description>
        )}
      </div>
      <Dialog.Close asChild>
        <button type="button" aria-label={closeLabel}
          style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${C.borderHi}`,
            background: C.panel, color: C.dim, cursor: "pointer", flexShrink: 0 }}>
          ×
        </button>
      </Dialog.Close>
    </div>
  );
}

// Right/bottom drawer shell. `open` + `onClose` drive Radix; children render the
// drawer body (typically a DrawerHeader followed by sections). When closed,
// nothing renders (Radix unmounts via Portal). Matches the existing metadata
// drawer geometry exactly (460px right panel on lg, bottom sheet on mobile).
export function DrawerWrapper({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: ReactNode;
}) {
  // Desktop width is resizable + persisted; `null` until mounted so SSR/mobile fall back to the CSS class.
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(DRAWER_WIDTH_KEY));
    setWidth(saved ? clampDrawerW(saved) : DRAWER_DEFAULT_W);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    // dragging the left edge: moving left (smaller clientX) widens the right-anchored drawer
    const next = clampDrawerW(dragRef.current.startW + (dragRef.current.startX - e.clientX));
    setWidth(next);
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    setWidth((w) => {
      if (w != null) window.localStorage.setItem(DRAWER_WIDTH_KEY, String(w));
      return w;
    });
  }, [onPointerMove]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width ?? DRAWER_DEFAULT_W };
    setDragging(true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  }, [width, onPointerMove, endDrag]);

  // keyboard resize for accessibility (focus the handle, use arrow keys)
  const onHandleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidth((w) => clampDrawerW((w ?? DRAWER_DEFAULT_W) + step)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidth((w) => clampDrawerW((w ?? DRAWER_DEFAULT_W) - step)); }
    else return;
    setWidth((w) => { if (w != null) window.localStorage.setItem(DRAWER_WIDTH_KEY, String(w)); return w; });
  }, []);

  // Apply the resizable width only at lg+; below lg the bottom-sheet CSS class owns layout.
  const desktop = typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches;
  const widthStyle = width != null && desktop ? { width, maxWidth: "90vw" } : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 70 }} />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-[80] max-h-[86vh] rounded-t-xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-xl"
          style={{ background: C.rail, border: `1px solid ${C.borderHi}`, color: C.text, overflowY: "auto",
            padding: 20, boxShadow: "-18px 0 50px rgba(0,0,0,0.38)",
            ...(widthStyle ?? {}),
            // suppress text selection while dragging the handle
            userSelect: dragging ? "none" : undefined }}
        >
          {/* Resize handle — desktop only (hidden < lg). Drag, or focus + ArrowLeft/Right. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            tabIndex={0}
            onPointerDown={startDrag}
            onKeyDown={onHandleKeyDown}
            className="hidden lg:block"
            style={{ position: "absolute", top: 0, left: 0, width: 10, height: "100%",
              cursor: "col-resize", touchAction: "none",
              // a thin visible grip line, brighter while dragging
              borderLeft: `2px solid ${dragging ? C.cyan : "transparent"}`,
              background: dragging ? "rgba(120,162,205,0.08)" : "transparent", zIndex: 1 }}
          />
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Reusable metric-inspector drawer: header + a fail-closed FieldRow list + optional
// extra sections (provenance, formulas, a chart). The standard drill target for a
// MetricRow/Stat `onDrill` — compose, don't build a new drawer per page. Each missing
// field renders "Not available" via FieldRow, never blank.
export function MetricInspectorDrawer({ open, onClose, title, description, fields, children }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode;
  fields: { label: string; value: unknown }[]; children?: ReactNode;
}) {
  return (
    <DrawerWrapper open={open} onClose={onClose}>
      <DrawerHeader title={title} description={description} />
      <div style={{ marginTop: 16 }}>
        {fields.map((f) => (
          <FieldRow key={f.label} label={f.label} value={f.value} />
        ))}
      </div>
      {children}
    </DrawerWrapper>
  );
}
