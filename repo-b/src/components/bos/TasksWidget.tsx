"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Circle, Clock, AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface NvTask {
  id: string;
  task_name: string;
  status: "open" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  due_date: string | null;
  category: string | null;
  notes: string | null;
}

function dueDateLabel(due: string | null): string {
  if (!due) return "";
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

/**
 * TasksWidget — compact command-center widget showing today's tasks.
 * Fetches from /api/nv-tasks/today (tasks due today or overdue, open/in_progress).
 * Click-through to /app/tasks for the full view.
 */
export default function TasksWidget() {
  const [tasks, setTasks] = useState<NvTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/nv-tasks/today")
      .then((r) => r.json())
      .then((data) => {
        setTasks(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  async function toggleDone(task: NvTask) {
    const next: NvTask["status"] = task.status === "done" ? "open" : "done";
    try {
      await fetch(`/api/nv-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      setTasks((prev) =>
        prev
          .map((t) => (t.id === task.id ? { ...t, status: next } : t))
          .filter((t) => t.status !== "done")
      );
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-bm-border/20 bg-bm-surface/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bm-muted2">
          Today&apos;s tasks
        </p>
        <Link
          href="/app/tasks"
          className="flex items-center gap-1 text-[11px] text-bm-muted hover:text-bm-accent transition-colors"
        >
          All tasks
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <p className="text-[12px] text-bm-muted2">Loading…</p>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-[12px] text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />
          Could not load tasks
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <p className="text-[12px] text-bm-muted2">
          Nothing due today.{" "}
          <Link href="/app/tasks" className="text-bm-accent hover:underline">
            Add a task →
          </Link>
        </p>
      )}

      {!loading && !error && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2.5">
              <button
                onClick={() => toggleDone(task)}
                className="mt-0.5 shrink-0"
                title="Mark done"
              >
                {task.status === "done" ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-bm-muted2 hover:text-bm-accent transition-colors" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug text-bm-text truncate">
                  {task.task_name}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  {task.category && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2">
                      {task.category}
                    </span>
                  )}
                  {task.due_date && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[11px]",
                        dueDateColor(task.due_date)
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {dueDateLabel(task.due_date)}
                    </span>
                  )}
                  {task.priority === "high" && (
                    <span className="text-[11px] text-red-400">high</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
