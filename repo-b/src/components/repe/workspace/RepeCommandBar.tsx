"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Command, Loader2 } from "lucide-react";
import {
  resolveQuery,
  type QueryResolverResponse,
  type QueryResolverAction,
  type QueryResolverEntity,
  type QueryResolverFilter,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

// ---------------------------------------------------------------------------
// Slash command registry (client-side, no round-trip)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Type badges
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  fund: { label: "Fund", color: "bg-blue-500/20 text-blue-400" },
  investment: { label: "Inv", color: "bg-emerald-500/20 text-emerald-400" },
  asset: { label: "Asset", color: "bg-amber-500/20 text-amber-400" },
  deal: { label: "Deal", color: "bg-purple-500/20 text-purple-400" },
  partner: { label: "LP", color: "bg-cyan-500/20 text-cyan-400" },
};

// ---------------------------------------------------------------------------
// Result rows
// ---------------------------------------------------------------------------

function FilterRow({ filter, onClick }: { filter: QueryResolverFilter; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bm-surface/60 transition-colors">
      <span className="rounded bg-bm-accent/15 px-1.5 py-0.5 text-[10px] font-mono text-bm-accent">Filter</span>
      <span className="text-bm-text">{filter.field.replace(/_/g, " ")} {filter.operator} {String(filter.value)}</span>
    </button>
  );
}

function EntityRow({ entity, onClick }: { entity: QueryResolverEntity; onClick: () => void }) {
  const badge = TYPE_BADGE[entity.entity_type] || { label: entity.entity_type, color: "bg-bm-surface text-bm-muted2" };
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bm-surface/60 transition-colors">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${badge.color}`}>{badge.label}</span>
      <span className="flex-1 truncate text-bm-text">{entity.name}</span>
      {entity.metric && <span className="font-mono text-bm-accent text-[10px]">{entity.metric.value}</span>}
    </button>
  );
}

function ActionRow({ action, onClick }: { action: QueryResolverAction; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bm-surface/60 transition-colors">
      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-mono text-purple-400">{action.command}</span>
      <span className="text-bm-text">{action.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component — standalone, no PortfolioFilterProvider dependency
// ---------------------------------------------------------------------------

export function RepeCommandBar({ base }: { base: string }) {
  const { envId } = useReEnv();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResolverResponse | null>(null);

  // Debounced query resolver
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 1) {
      setResults(null);
      setLoading(false);
      return;
    }

    // Slash commands — instant client-side match
    if (query.startsWith("/")) {
      const lower = query.toLowerCase();
      const matches = SLASH_COMMANDS.filter((c) =>
        c.command.startsWith(lower) || c.label.toLowerCase().includes(lower.slice(1))
      );
      setResults({
        filters: [],
        entities: [],
        actions: matches.map((m) => ({ command: m.command, label: m.label })),
        slash_command: matches[0]?.command || null,
      });
      setLoading(false);
      return;
    }

    if (query.length < 2 || !envId) return;

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      resolveQuery(envId, query)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, envId]);

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const navigateEntity = useCallback((entity: QueryResolverEntity) => {
    const routes: Record<string, string> = {
      fund: `${base}/funds/${entity.entity_id}`,
      asset: `${base}/assets/${entity.entity_id}`,
      investment: `${base}/investments/${entity.entity_id}`,
      deal: `${base}/deals/${entity.entity_id}`,
    };
    const route = routes[entity.entity_type];
    if (route) { router.push(route); setQuery(""); setIsOpen(false); }
  }, [base, router]);

  const executeAction = useCallback((action: QueryResolverAction) => {
    const routes: Record<string, string> = {
      "/open fund": `${base}/funds`,
      "/open asset": `${base}/assets`,
      "/compare funds": `${base}/models`,
      "/run model": `${base}/models`,
      "/variance analysis": `${base}/variance`,
      "/debt surveillance": `${base}/surveillance`,
      "/create asset": `${base}/assets/new`,
      "/create fund": `${base}/funds/new`,
      "/import data": `${base}/documents`,
    };
    const route = routes[action.command];
    if (route) { router.push(route); setQuery(""); setIsOpen(false); }
  }, [base, router]);

  const applyFilter = useCallback((filter: QueryResolverFilter) => {
    // Navigate to funds page with filter as query param
    const params = new URLSearchParams();
    if (typeof filter.value === "number") {
      params.set("mf", `${filter.field}${filter.operator}${filter.value}`);
    } else {
      params.set(filter.field, String(filter.value));
    }
    router.push(`${base}/funds?${params.toString()}`);
    setQuery("");
    setIsOpen(false);
  }, [base, router]);

  const hasResults = results && (results.filters.length > 0 || results.entities.length > 0 || results.actions.length > 0);

  return (
    <div className="relative w-full max-w-[480px]">
      <div
        className={`flex items-center gap-2 rounded-md border bg-bm-bg/60 px-3 py-1 transition-colors ${
          isOpen ? "border-bm-accent/40 ring-1 ring-bm-accent/20" : "border-bm-border/30 hover:border-bm-border/50"
        }`}
      >
        <Search className="h-3 w-3 text-bm-muted2 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!isOpen) setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search or command…"
          className="flex-1 bg-transparent text-[11px] text-bm-text placeholder:text-bm-muted2 outline-none"
        />
        {loading && <Loader2 className="h-3 w-3 text-bm-muted2 animate-spin" />}
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-bm-border/30 px-1 py-0.5 text-[9px] font-mono text-bm-muted2">
          <Command className="h-2 w-2" />K
        </kbd>
      </div>

      {isOpen && hasResults && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[360px] overflow-y-auto rounded-md border border-bm-border/30 bg-bm-bg shadow-lg shadow-black/20 py-1">
            {results!.filters.length > 0 && (
              <div className="px-2 py-1">
                <p className="px-1 pb-1 text-[9px] uppercase tracking-wider text-bm-muted2">Quick Filters</p>
                {results!.filters.map((f, i) => <FilterRow key={i} filter={f} onClick={() => applyFilter(f)} />)}
              </div>
            )}
            {results!.entities.length > 0 && (
              <div className="px-2 py-1">
                <p className="px-1 pb-1 text-[9px] uppercase tracking-wider text-bm-muted2">Entities</p>
                {results!.entities.map((e, i) => <EntityRow key={i} entity={e} onClick={() => navigateEntity(e)} />)}
              </div>
            )}
            {results!.actions.length > 0 && (
              <div className="px-2 py-1">
                <p className="px-1 pb-1 text-[9px] uppercase tracking-wider text-bm-muted2">Actions</p>
                {results!.actions.map((a, i) => <ActionRow key={i} action={a} onClick={() => executeAction(a)} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
