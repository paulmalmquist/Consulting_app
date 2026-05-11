"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle, Circle, Clock, AlertCircle, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

type TaskStatus = "open" | "in_progress" | "done";
type TaskPriority = "high" | "medium" | "low";

interface NvTask {
  id: string;
  task_name: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
] as const;

const CATEGORY_FILTERS = [
  { key: "all", label: "All categories" },
  { key: "outreach", label: "Outreach" },
  { key: "follow-up", label: "Follow-up" },
  { key: "onboarding", label: "Onboarding" },
  { key: "product", label: "Product" },
  { key: "research", label: "Research" },
  { key: "admin", label: "Admin" },
] as const;

function priorityColor(p: TaskPriority) {
  return p === "high"
    ? "text-red-400"
    : p === "medium"
      ? "text-amber-400"
      : "text-bm-muted2";
}

function dueDateLabel(due: string | null): string {
  if (!due) return "";
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function dueDateColor(due: string | null): string {
  if (!due) return "text-bm-muted2";
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "text-red-400";
  if (diff === 0) return "text-amber-400";
  return "text-bm-muted2";
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done")
    return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === "in_progress")
    return <Circle className="h-4 w-4 text-blue-400 shrink-0" />;
  return <Circle className="h-4 w-4 text-bm-muted2 shrink-0" />;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<NvTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("");
  const [newTaskNotes, setNewTaskNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/nv-tasks?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function toggleStatus(task: NvTask) {
    const next: TaskStatus =
      task.status === "open"
        ? "in_progress"
        : task.status === "in_progress"
          ? "done"
          : "open";
    try {
      await fetch(`/api/nv-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
      );
    } catch {
      // silently fail — optimistic update already applied
    }
  }

  async function addTask() {
    if (!newTaskName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/nv-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_name: newTaskName.trim(),
          priority: newTaskPriority,
          due_date: newTaskDue || null,
          category: newTaskCategory || null,
          notes: newTaskNotes || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      setTasks((prev) => [created, ...prev]);
      setNewTaskName("");
      setNewTaskPriority("medium");
      setNewTaskDue("");
      setNewTaskCategory("");
      setNewTaskNotes("");
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  const grouped = {
    open: tasks.filter((t) => t.status === "open"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
  };

  const visibleGroups =
    statusFilter === "all"
      ? (["in_progress", "open", "done"] as const)
      : ([statusFilter] as const);

  const groupLabel: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    done: "Done",
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-bm-muted2">
            Execution layer
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-bm-text">
            Tasks
          </h1>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-bm-accent/10 px-3 py-1.5 text-[13px] font-medium text-bm-accent hover:bg-bm-accent/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add task
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-bm-text">New task</span>
            <button onClick={() => setShowAddForm(false)}>
              <X className="h-4 w-4 text-bm-muted2 hover:text-bm-text" />
            </button>
          </div>
          <input
            autoFocus
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Task name"
            className="w-full rounded border border-bm-border/30 bg-bm-bg px-3 py-2 text-[13px] text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:border-bm-accent/50"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
              className="rounded border border-bm-border/30 bg-bm-bg px-2 py-1.5 text-[12px] text-bm-text focus:outline-none"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <input
              type="date"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              className="rounded border border-bm-border/30 bg-bm-bg px-2 py-1.5 text-[12px] text-bm-text focus:outline-none"
            />
            <select
              value={newTaskCategory}
              onChange={(e) => setNewTaskCategory(e.target.value)}
              className="rounded border border-bm-border/30 bg-bm-bg px-2 py-1.5 text-[12px] text-bm-text focus:outline-none"
            >
              <option value="">Category</option>
              {CATEGORY_FILTERS.filter((c) => c.key !== "all").map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <input
            value={newTaskNotes}
            onChange={(e) => setNewTaskNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full rounded border border-bm-border/30 bg-bm-bg px-3 py-2 text-[13px] text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:border-bm-accent/50"
          />
          <div className="flex gap-2">
            <button
              onClick={addTask}
              disabled={saving || !newTaskName.trim()}
              className="rounded-md bg-bm-accent px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50 hover:bg-bm-accent/90 transition-colors"
            >
              {saving ? "Saving…" : "Add"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-md px-3 py-1.5 text-[13px] text-bm-muted hover:text-bm-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                statusFilter === f.key
                  ? "bg-bm-accent/15 text-bm-accent"
                  : "text-bm-muted hover:text-bm-text"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-bm-border/30" />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-bm-border/30 bg-bm-bg px-2 py-1 text-[12px] text-bm-muted focus:outline-none focus:text-bm-text"
        >
          {CATEGORY_FILTERS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Task groups */}
      {loading ? (
        <div className="py-12 text-center text-[13px] text-bm-muted2">Loading…</div>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((group) => {
            const items = grouped[group as keyof typeof grouped] ?? [];
            if (items.length === 0 && statusFilter !== "all") return null;
            return (
              <div key={group}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bm-muted2">
                    {groupLabel[group]}
                  </span>
                  <span className="rounded-full bg-bm-surface/30 px-1.5 py-0.5 font-mono text-[10px] text-bm-muted2">
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="px-1 text-[13px] text-bm-muted2">None</p>
                ) : (
                  <div className="divide-y divide-bm-border/10 rounded-lg border border-bm-border/20 bg-bm-surface/10">
                    {items.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-bm-surface/20 transition-colors"
                      >
                        <button
                          onClick={() => toggleStatus(task)}
                          className="mt-0.5 shrink-0"
                          title={`Mark as ${task.status === "open" ? "in progress" : task.status === "in_progress" ? "done" : "open"}`}
                        >
                          <StatusIcon status={task.status} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-[13px] leading-snug text-bm-text",
                              task.status === "done" && "line-through text-bm-muted2"
                            )}
                          >
                            {task.task_name}
                          </p>
                          {task.notes && (
                            <p className="mt-0.5 text-[12px] text-bm-muted2 truncate">
                              {task.notes}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {task.category && (
                              <span className="rounded bg-bm-surface/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2">
                                {task.category}
                              </span>
                            )}
                            <span className={cn("text-[11px]", priorityColor(task.priority))}>
                              {task.priority}
                            </span>
                            {task.due_date && (
                              <span className={cn("flex items-center gap-1 text-[11px]", dueDateColor(task.due_date))}>
                                <Clock className="h-3 w-3" />
                                {dueDateLabel(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
