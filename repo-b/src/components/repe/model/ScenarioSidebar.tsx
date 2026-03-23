"use client";

import { useState } from "react";
import { PlusCircle, Copy, Trash2, Shield, Play } from "lucide-react";
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
    <div className="flex w-56 shrink-0 flex-col rounded-lg border border-bm-border/50 bg-bm-surface/10">
      <div className="border-b border-bm-border/30 px-3 py-2">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted">
          Scenarios
        </h3>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
        {scenarios.map((s) => {
          const isActive = activeScenarioId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group flex w-full flex-col rounded px-2.5 py-2 text-left transition-colors ${
                isActive
                  ? "bg-blue-500/10 border border-blue-500/25"
                  : "hover:bg-bm-surface/20 border border-transparent"
              }`}
              data-testid={`scenario-${s.id}`}
            >
              {/* Name row */}
              <div className="flex items-center gap-1.5">
                {s.is_base && <Shield size={10} className="shrink-0 text-blue-400" />}
                <span className={`flex-1 truncate text-xs font-medium ${isActive ? "text-bm-text" : "text-bm-muted2"}`}>
                  {s.name}
                </span>

                {!readOnly && !s.is_base && isActive && (
                  <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onClone(s.id); }}
                      className="rounded p-0.5 hover:bg-bm-surface/40"
                      title="Clone"
                    >
                      <Copy size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      disabled={deletingId === s.id}
                      className="rounded p-0.5 text-red-400 hover:bg-red-500/15"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                )}
              </div>

              {/* Compact metadata */}
              <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-bm-muted">
                <span>{s.is_base ? "Base Case" : "Custom"}</span>
                <span className="text-bm-border">·</span>
                <span>{new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
            </button>
          );
        })}
      </div>

      {!readOnly && (
        <div className="border-t border-bm-border/30 p-1.5">
          {showCreate ? (
            <div className="space-y-1">
              <input
                className="w-full rounded border border-bm-border/50 bg-bm-surface/10 px-2 py-1 text-xs outline-none transition-colors focus:border-bm-border-strong/70"
                placeholder="Scenario name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setShowCreate(false);
                }}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="flex-1 rounded bg-bm-accent px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-40"
                >
                  {creating ? "..." : "Create"}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); }}
                  className="rounded border border-bm-border/40 px-2 py-0.5 text-[10px] text-bm-muted2 hover:bg-bm-surface/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-[10px] text-bm-muted2 transition-colors hover:bg-bm-surface/20 hover:text-bm-text"
            >
              <PlusCircle size={11} />
              New Scenario
            </button>
          )}
        </div>
      )}
    </div>
  );
}
