"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { C } from "./primitives";

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
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 70 }} />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-[80] max-h-[86vh] rounded-t-xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-xl"
          style={{ background: C.rail, border: `1px solid ${C.borderHi}`, color: C.text, overflowY: "auto",
            padding: 20, boxShadow: "-18px 0 50px rgba(0,0,0,0.38)" }}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
