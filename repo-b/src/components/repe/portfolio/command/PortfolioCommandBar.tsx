"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Command, Loader2 } from "lucide-react";
import { useCommandBar } from "./useCommandBar";
import { usePortfolioFilters } from "../PortfolioFilterContext";
import { useRepeBasePath } from "@/lib/repe-context";
import type { QueryResolverResponse, QueryResolverAction, QueryResolverEntity, QueryResolverFilter } from "@/lib/bos-api";

// ---------------------------------------------------------------------------
// Entity type badges
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  fund: { label: "Fund", color: "bg-blue-500/20 text-blue-400" },
  investment: { label: "Inv", color: "bg-emerald-500/20 text-emerald-400" },
  asset: { label: "Asset", color: "bg-amber-500/20 text-amber-400" },
  deal: { label: "Deal", color: "bg-purple-500/20 text-purple-400" },
  partner: { label: "LP", color: "bg-cyan-500/20 text-cyan-400" },
};

// ---------------------------------------------------------------------------
// Result Groups
// ---------------------------------------------------------------------------

function FilterResultRow({ filter, onClick }: { filter: QueryResolverFilter; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bm-surface/60 transition-colors"
    >
      <span className="rounded bg-bm-accent/15 px-1.5 py-0.5 text-[10px] font-mono text-bm-accent">
        Filter
      </span>
      <span className="text-bm-text">
        {filter.field.replace(/_/g, " ")} {filter.operator} {String(filter.value)}
      </span>
    </button>
  );
}

function EntityResultRow({ entity, onClick }: { entity: QueryResolverEntity; onClick: () => void }) {
  const badge = TYPE_BADGE[entity.entity_type] || { label: entity.entity_type, color: "bg-bm-surface text-bm-muted2" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bm-surface/60 transition-colors"
    >
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${badge.color}`}>
        {badge.label}
      </span>
      <span className="flex-1 truncate text-bm-text">{entity.name}</span>
      {entity.secondary && (
        <span className="text-bm-muted2 text-[10px]">{entity.secondary}</span>
      )}
      {entity.metric && (
        <span className="font-mono text-bm-accent text-[10px]">{entity.metric.value}</span>
      )}
    </button>
  );
}

function ActionResultRow({ action, onClick }: { action: QueryResolverAction; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bm-surface/60 transition-colors"
    >
      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-mono text-purple-400">
        {action.command}
      </span>
      <span className="text-bm-text">{action.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Results Dropdown
// ---------------------------------------------------------------------------

function ResultsDropdown({
  results,
  onApplyFilter,
  onNavigateEntity,
  onExecuteAction,
}: {
  results: QueryResolverResponse;
  onApplyFilter: (filter: QueryResolverFilter) => void;
  onNavigateEntity: (entity: QueryResolverEntity) => void;
  onExecuteAction: (action: QueryResolverAction) => void;
}) {
  const hasContent = results.filters.length > 0 || results.entities.length > 0 || results.actions.length > 0;

  if (!hasContent) {
    return (
      <div className="px-3 py-4 text-center text-xs text-bm-muted2">
        No results found
      </div>
    );
  }

  return (
    <div className="max-h-[360px] overflow-y-auto py-1">
      {results.filters.length > 0 && (
        <div className="px-2 py-1">
          <p className="px-1 pb-1 text-[9px] uppercase tracking-wider text-bm-muted2">Quick Filters</p>
          {results.filters.map((f, i) => (
            <FilterResultRow key={i} filter={f} onClick={() => onApplyFilter(f)} />
          ))}
        </div>
      )}

      {results.entities.length > 0 && (
        <div className="px-2 py-1">
          <p className="px-1 pb-1 text-[9px] uppercase tracking-wider text-bm-muted2">Entities</p>
          {results.entities.map((e, i) => (
            <EntityResultRow key={i} entity={e} onClick={() => onNavigateEntity(e)} />
          ))}
        </div>
      )}

      {results.actions.length > 0 && (
        <div className="px-2 py-1">
          <p className="px-1 pb-1 text-[9px] uppercase tracking-wider text-bm-muted2">Actions</p>
          {results.actions.map((a, i) => (
            <ActionResultRow key={i} action={a} onClick={() => onExecuteAction(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PortfolioCommandBar() {
  const { query, setQuery, results, loading, isOpen, setIsOpen } = useCommandBar();
  const { addMetricFilter, addAttributeFilter } = usePortfolioFilters();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleApplyFilter = useCallback(
    (filter: QueryResolverFilter) => {
      if (typeof filter.value === "number") {
        addMetricFilter({
          field: filter.field,
          operator: filter.operator as "<" | ">" | "<=" | ">=" | "=",
          value: filter.value,
        });
      } else {
        addAttributeFilter({ field: filter.field, value: String(filter.value) });
      }
      setQuery("");
      setIsOpen(false);
    },
    [addMetricFilter, addAttributeFilter, setQuery, setIsOpen]
  );

  const handleNavigateEntity = useCallback(
    (entity: QueryResolverEntity) => {
      const typeRoutes: Record<string, string> = {
        fund: `${basePath}/funds/${entity.entity_id}`,
        asset: `${basePath}/assets/${entity.entity_id}`,
        investment: `${basePath}/investments/${entity.entity_id}`,
        deal: `${basePath}/deals/${entity.entity_id}`,
      };
      const route = typeRoutes[entity.entity_type];
      if (route) {
        router.push(route);
        setQuery("");
        setIsOpen(false);
      }
    },
    [basePath, router, setQuery, setIsOpen]
  );

  const handleExecuteAction = useCallback(
    (action: QueryResolverAction) => {
      const commandRoutes: Record<string, string> = {
        "/open fund": `${basePath}/funds`,
        "/open asset": `${basePath}/assets`,
        "/compare funds": `${basePath}/models`,
        "/run model": `${basePath}/models`,
        "/variance analysis": `${basePath}/variance`,
        "/debt surveillance": `${basePath}/surveillance`,
        "/create asset": `${basePath}/assets/new`,
        "/create fund": `${basePath}/funds/new`,
        "/import data": `${basePath}/documents`,
      };
      const route = commandRoutes[action.command];
      if (route) {
        router.push(route);
        setQuery("");
        setIsOpen(false);
      }
    },
    [basePath, router, setQuery, setIsOpen]
  );

  return (
    <div className="relative w-full max-w-[560px]">
      {/* Input */}
      <div
        className={`flex items-center gap-2 rounded-md border bg-bm-bg/60 px-3 py-1.5 transition-colors ${
          isOpen ? "border-bm-accent/40 ring-1 ring-bm-accent/20" : "border-bm-border/30 hover:border-bm-border/50"
        }`}
      >
        <Search className="h-3.5 w-3.5 text-bm-muted2 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search or run a command…"
          className="flex-1 bg-transparent text-xs text-bm-text placeholder:text-bm-muted2 outline-none"
        />
        {loading && <Loader2 className="h-3 w-3 text-bm-muted2 animate-spin" />}
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-bm-border/30 px-1.5 py-0.5 text-[9px] font-mono text-bm-muted2">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </div>

      {/* Dropdown */}
      {isOpen && results && query.length >= 1 && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Results panel */}
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-bm-border/30 bg-bm-bg shadow-lg shadow-black/20">
            <ResultsDropdown
              results={results}
              onApplyFilter={handleApplyFilter}
              onNavigateEntity={handleNavigateEntity}
              onExecuteAction={handleExecuteAction}
            />
          </div>
        </>
      )}
    </div>
  );
}
