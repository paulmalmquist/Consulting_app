"use client";

import { useState } from "react";
import { PlusCircle, Copy, Trash2, Shield } from "lucide-react";
import type { ModelScenario } from "@/lib/bos-api";

interface ScenarioSidebarProps {
  scenarios: ModelScenario[];
  activeScenarioId: string | null;
  onSelect: (scenarioId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onClone: (scenarioId: string) => Promise<void>;
  onDelete: (scenarioId: string) => Promise<void>;
  readOnly?: boolean;
}

export function ScenarioSidebar({
  scenarios,
  activeScenarioId,
  onSelect,
  onCreate,
  onClone,
  onDelete,
  readOnly,
}: ScenarioSidebarProps) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(newName.trim());
      setNewName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (scenarioId: string) => {
    if (deletingId) return;
    setDeletingId(scenarioId);
    try {
      await onDelete(scenarioId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex w-52 shrink-0 flex-col rounded-xl border border-bm-border/70 bg-bm-surface/20">
      <div className="border-b border-bm-border/30 px-3 py-2.5">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          Scenarios
        </h3>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
              activeScenarioId === s.id
                ? "bg-bm-accent/15 text-bm-text border border-bm-accent/30"
                : "text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text border border-transparent"
            }`}
            data-testid={`scenario-${s.id}`}
          >
            {s.is_base && <Shield size={12} className="shrink-0 text-bm-accent" />}
            <span className="flex-1 truncate">{s.name}</span>

            {!readOnly && !s.is_base && activeScenarioId === s.id && (
              <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClone(s.id); }}
                  className="rounded p-0.5 hover:bg-bm-surface/50"
                  title="Clone scenario"
                >
                  <Copy size={11} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                  disabled={deletingId === s.id}
                  className="rounded p-0.5 hover:bg-red-500/20 text-red-400"
                  title="Delete scenario"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            )}
          </button>
        ))}
      </div>

      {!readOnly && (
        <div className="border-t border-bm-border/30 p-2">
          {showCreate ? (
            <div className="space-y-1.5">
              <input
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/18 px-2 py-1.5 text-xs outline-none transition-colors focus:border-bm-border-strong/70"
                placeholder="Scenario name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="flex-1 rounded-md bg-bm-accent px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                >
                  {creating ? "..." : "Create"}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); }}
                  className="rounded-md border border-bm-border/50 px-2 py-1 text-[11px] text-bm-muted2 hover:bg-bm-surface/30"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-bm-muted2 transition-colors hover:bg-bm-surface/30 hover:text-bm-text"
            >
              <PlusCircle size={12} />
              New Scenario
            </button>
          )}
        </div>
      )}
    </div>
  );
}
