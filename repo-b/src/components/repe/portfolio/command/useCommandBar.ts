"use client";

import { useCallback, useEffect, useRef } from "react";
import { resolveQuery, type QueryResolverResponse } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import { usePortfolioFilters } from "../PortfolioFilterContext";

// Slash command registry (static, no server round-trip needed)
const SLASH_COMMANDS = [
  { command: "/open fund", label: "Open a fund" },
  { command: "/open asset", label: "Open an asset" },
  { command: "/compare funds", label: "Compare funds" },
  { command: "/run model", label: "Run a model" },
  { command: "/variance analysis", label: "Open variance analysis" },
  { command: "/debt surveillance", label: "Open debt surveillance" },
  { command: "/create asset", label: "Create a new asset" },
  { command: "/create fund", label: "Create a new fund" },
  { command: "/import data", label: "Import data" },
];

export function useCommandBar() {
  const { environmentId } = useRepeContext();
  const {
    command,
    setCommandQuery,
    setCommandOpen,
    setCommandResults,
    setCommandLoading,
    filters,
  } = usePortfolioFilters();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced query resolver
  const resolveQueryDebounced = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();

      // Slash commands: instant client-side match, no server call
      if (query.startsWith("/")) {
        const lower = query.toLowerCase();
        const matches = SLASH_COMMANDS.filter((c) =>
          c.command.startsWith(lower) || c.label.toLowerCase().includes(lower.slice(1))
        );
        setCommandResults({
          filters: [],
          entities: [],
          actions: matches.map((m) => ({
            command: m.command,
            label: m.label,
          })),
          slash_command: matches[0]?.command || null,
        });
        return;
      }

      if (!query || query.length < 2 || !environmentId) {
        setCommandResults(null);
        return;
      }

      setCommandLoading(true);

      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const result = await resolveQuery(environmentId, query, filters.quarter);
          if (!controller.signal.aborted) {
            setCommandResults(result);
          }
        } catch {
          if (!controller.signal.aborted) {
            setCommandResults(null);
          }
        }
      }, 200);
    },
    [environmentId, filters.quarter, setCommandResults, setCommandLoading]
  );

  // Auto-resolve when query changes
  useEffect(() => {
    resolveQueryDebounced(command.query);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [command.query, resolveQueryDebounced]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(!command.isOpen);
      }
      if (e.key === "Escape" && command.isOpen) {
        setCommandOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [command.isOpen, setCommandOpen]);

  return {
    query: command.query,
    setQuery: setCommandQuery,
    results: command.results,
    loading: command.loading,
    isOpen: command.isOpen,
    setIsOpen: setCommandOpen,
    slashCommands: SLASH_COMMANDS,
  };
}
