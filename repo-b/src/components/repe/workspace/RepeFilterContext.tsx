"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface RepeFilters {
  fund: string;
  market: string;
  sector: string;
  vintage: string;
  status: string;
}

const EMPTY: RepeFilters = { fund: "", market: "", sector: "", vintage: "", status: "" };
const STORAGE_KEY = "repe-filters";

interface RepeFilterContextValue {
  filters: RepeFilters;
  setFilter: (key: keyof RepeFilters, value: string) => void;
  resetFilters: () => void;
  /** Available options for each filter, populated by pages that load data */
  options: RepeFilterOptions;
  setOptions: (opts: Partial<RepeFilterOptions>) => void;
}

export interface RepeFilterOptions {
  funds: { value: string; label: string }[];
  markets: { value: string; label: string }[];
  sectors: { value: string; label: string }[];
  vintages: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
}

const EMPTY_OPTIONS: RepeFilterOptions = {
  funds: [],
  markets: [],
  sectors: [],
  vintages: [],
  statuses: [],
};

const Ctx = createContext<RepeFilterContextValue | null>(null);

function loadFilters(): RepeFilters {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

function persistFilters(f: RepeFilters) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {}
}

export function RepeFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<RepeFilters>(EMPTY);
  const [options, setOptionsState] = useState<RepeFilterOptions>(EMPTY_OPTIONS);

  useEffect(() => {
    setFilters(loadFilters());
  }, []);

  const setFilter = useCallback((key: keyof RepeFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      persistFilters(next);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY);
    persistFilters(EMPTY);
  }, []);

  const setOptions = useCallback((opts: Partial<RepeFilterOptions>) => {
    setOptionsState((prev) => ({ ...prev, ...opts }));
  }, []);

  return (
    <Ctx.Provider value={{ filters, setFilter, resetFilters, options, setOptions }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRepeFilters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRepeFilters must be used within RepeFilterProvider");
  return ctx;
}

/** Safe version that returns null outside provider (for optional usage) */
export function useRepeFiltersOptional() {
  return useContext(Ctx);
}
