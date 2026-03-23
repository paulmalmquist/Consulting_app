"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface DashboardFilterState {
  activeFilters: Record<string, string | string[]>;
  setFilter: (dimension: string, value: string | string[] | null) => void;
  clearFilters: () => void;
}

const DashboardFilterContext = createContext<DashboardFilterState>({
  activeFilters: {},
  setFilter: () => {},
  clearFilters: () => {},
});

/* --------------------------------------------------------------------------
 * Provider
 * -------------------------------------------------------------------------- */
export function DashboardFilterProvider({ children }: { children: React.ReactNode }) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string | string[]>>({});

  const setFilter = useCallback((dimension: string, value: string | string[] | null) => {
    setActiveFilters((prev) => {
      if (value === null) {
        const next = { ...prev };
        delete next[dimension];
        return next;
      }
      return { ...prev, [dimension]: value };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters({});
  }, []);

  return (
    <DashboardFilterContext.Provider value={{ activeFilters, setFilter, clearFilters }}>
      {children}
    </DashboardFilterContext.Provider>
  );
}

/* --------------------------------------------------------------------------
 * Hook
 * -------------------------------------------------------------------------- */
export function useDashboardFilters(): DashboardFilterState {
  return useContext(DashboardFilterContext);
}
