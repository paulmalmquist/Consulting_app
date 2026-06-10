"use client";

import { useState } from "react";
import { LegalfinContext, type LegalfinContextValue } from "@/lib/legalfin-context";

export default function LegalfinLayout({ children }: { children: React.ReactNode }) {
  const [firmKey, setFirmKeyState] = useState<string | null>(null);
  const [firmName, setFirmNameState] = useState<string | null>(null);

  const ctx: LegalfinContextValue = {
    firmKey,
    firmName,
    period: "2025",
    setFirm: (key, name) => {
      setFirmKeyState(key);
      setFirmNameState(name);
    },
  };

  return (
    <LegalfinContext.Provider value={ctx}>
      {children}
    </LegalfinContext.Provider>
  );
}
