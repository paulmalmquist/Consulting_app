"use client";

/**
 * ProfitSolv legal finance context — simple React state, no backend init call.
 *
 * Unlike the REPE context, legalfin has no per-tenant environment to initialize.
 * The Gold Parquet is fixed demo data; firm_key is a query filter, not a tenant.
 * This context just carries the selected firm + period for the dashboard UI.
 */

import { createContext, useContext, useState, useCallback } from "react";

export interface LegalfinContextValue {
  /** Selected firm UUID (null = portfolio-wide view) */
  firmKey: string | null;
  /** Display label for the currently selected firm (null = "All Firms") */
  firmName: string | null;
  /** Period label (fixed for this demo seed) */
  period: string;
  setFirm: (firmKey: string | null, firmName: string | null) => void;
}

const LegalfinContext = createContext<LegalfinContextValue | null>(null);

export function useLegalfinContext(): LegalfinContextValue {
  const ctx = useContext(LegalfinContext);
  if (!ctx) {
    throw new Error("useLegalfinContext must be used inside LegalfinProvider");
  }
  return ctx;
}

export { LegalfinContext };
