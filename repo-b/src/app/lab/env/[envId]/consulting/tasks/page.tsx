"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { LeftSidebar } from "@/components/operator/command-desk/layout/LeftSidebar";
import { consultingSidebarSections } from "@/app/lab/env/[envId]/operator/_sidebar";
import { apiFetch } from "@/lib/api";

const CRO_BASE = "/bos/api/consulting";

type TaskStatus = "pending" | "done" | "skipped";
type TaskPriority = "high" | "normal" | "low";

interface NextAction {
  id: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  description: string;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  owner: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#FB923C",
  normal: "rgba(220,230,240,0.55)",
  low: "rgba(220,230,240,0.30)",
};

const STATUS_TONE: Record<TaskStatus, { color: string; bg: string }> = {
  pending: { color: "rgba(220,230,240,0.72)", bg: "rgba(220,230,240,0.07)" },
  done: { color: "#34D399", bg: "rgba(52,211,153,0.12)" },
  skipped: { color: "rgba(220,230,240,0.35)", bg: "rgba(220,230,240,0.04)" },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diff < 0) {
    const ahead = Math.abs(diff);
    if (ahead === 1) return "tomorrow";
    return `in ${ahead}d`;
  }
  if (diff === 0) return "today";
  if (diff === 1) return "1d ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const monoLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(220,230,240,0.42)",
};

const winstonBrand: ReactNode = (
  <span
    className="font-command"
    style={{
      fontSize: "1rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#ffffff",
      textShadow: "0 0 12px rgba(255,255,255,0.07)",
    }}
  >
    WINSTON
  </span>
);

export default function TasksPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const [tasks, setTasks] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(() => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setErrMsg(null);
    const status = statusFilter === "pending" ? "&status=pending" : "";
    apiFetch<NextAction[]>(
      `${CRO_BASE}/next-actions?env_id=${params.envId}&business_id=${businessId}${status}`,
    )
      .then(setTasks)
      .catch((err) => setErrMsg(err instanceof Error ? err.message : "Failed to load tasks"))
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function completeTask(id: string) {
    if (!businessId) return;
    setMutatingId(id);
    try {
      await apiFetch(`${CRO_BASE}/next-actions/${id}/complete?business_id=${businessId}`, {
        method: "POST",
        body: JSON.stringify({ notes: null }),
      });
      load();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to complete task");
    } finally {
      setMutatingId(null);
    }
  }

  async function skipTask(id: string) {
    if (!businessId) return;
    setMutatingId(id);
    try {
      await apiFetch(`${CRO_BASE}/next-actions/${id}/skip?business_id=${businessId}`, {
        method: "POST",
        body: JSON.stringify({ reason: "Skipped from tasks view" }),
      });
      load();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to skip task");
    } finally {
      setMutatingId(null);
    }
  }

  const kpi = useMemo(() => {
    const all = tasks;
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: all.length,
      dueToday: all.filter((t) => t.due_date === today && t.status === "pending").length,
      overdue: all.filter(
        (t) => t.due_date && t.due_date < today && t.status === "pending",
      ).length,
      high: all.filter((t) => t.priority === "high" && t.status === "pending").length,
      done: all.filter((t) => t.status === "done").length,
    };
  }, [tasks]);

  const visible = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...tasks].sort((a, b) => {
      const aOverdue = a.due_date && a.due_date < today ? -1 : 0;
      const bOverdue = b.due_date && b.due_date < today ? -1 : 0;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const priorityRank: Record<string, number> = { high: 0, normal: 1, low: 2 };
      return (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
    });
  }, [tasks]);

  return (
    <div
      data-command-desk
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        gridTemplateRows: "52px minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
        background: "#05070B",
      }}
    >
      <LeftSidebar
        mode="brand"
        brand={winstonBrand}
        sections={consultingSidebarSections(params.envId)}
        activeKey="tasks"
      />

      {/* Row 1 Col 2 — header bar */}
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          minWidth: 0,
        }}
      >
        <span style={{ ...monoLabel, fontSize: 12, letterSpacing: "0.18em", color: "rgba(220,230,240,0.72)" }}>
          Tasks
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setStatusFilter((s) => (s === "pending" ? "all" : "pending"))}
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "rgba(220,230,240,0.55)",
              cursor: "pointer",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            {statusFilter === "pending" ? "Show all" : "Pending only"}
          </button>
        </div>
      </div>

      <LeftSidebar
        mode="nav"
        sections={consultingSidebarSections(params.envId)}
        activeKey="tasks"
      />

      {/* Row 2 Col 2 — content */}
      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "16px 16px 24px",
          color: "#dce6f0",
        }}
      >
        {errMsg ? (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid rgba(239,68,68,0.30)",
              background: "rgba(239,68,68,0.08)",
              color: "#FCA5A5",
              fontSize: 13,
            }}
          >
            {errMsg}
          </div>
        ) : null}

        {/* KPI strip */}
        {!loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Total", value: kpi.total },
              { label: "Due today", value: kpi.dueToday, accent: kpi.dueToday > 0 },
              { label: "Overdue", value: kpi.overdue, danger: kpi.overdue > 0 },
              { label: "High priority", value: kpi.high, warn: kpi.high > 0 },
              { label: "Done", value: kpi.done },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "8px 10px",
                  borderRadius: 3,
                  border: `1px solid ${
                    item.danger
                      ? "rgba(239,68,68,0.30)"
                      : item.warn
                        ? "rgba(251,146,60,0.30)"
                        : item.accent
                          ? "rgba(0,220,255,0.25)"
                          : "rgba(255,255,255,0.07)"
                  }`,
                  background: item.danger
                    ? "rgba(239,68,68,0.06)"
                    : item.warn
                      ? "rgba(251,146,60,0.06)"
                      : item.accent
                        ? "rgba(0,220,255,0.04)"
                        : "rgba(10,14,20,0.4)",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: item.danger ? "#FCA5A5" : item.warn ? "#FB923C" : item.accent ? "#00DCFF" : "#dce6f0",
                    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  }}
                >
                  {item.value}
                </div>
                <div style={{ ...monoLabel, marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(220,230,240,0.35)", fontSize: 13 }}>
            Loading tasks…
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(255,255,255,0.10)",
              borderRadius: 4,
              padding: "28px 20px",
              color: "rgba(220,230,240,0.50)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            {statusFilter === "pending" ? "No pending tasks." : "No tasks found."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {visible.map((task) => {
              const today = new Date().toISOString().slice(0, 10);
              const isOverdue = task.due_date && task.due_date < today && task.status === "pending";
              const statusTone = STATUS_TONE[task.status] ?? STATUS_TONE.pending;
              const busy = mutatingId === task.id;
              return (
                <div
                  key={task.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "start",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 3,
                    border: `1px solid ${isOverdue ? "rgba(239,68,68,0.20)" : "rgba(255,255,255,0.06)"}`,
                    background: isOverdue ? "rgba(239,68,68,0.04)" : "rgba(10,14,20,0.35)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: task.status === "done" ? "rgba(220,230,240,0.40)" : "#dce6f0" }}>
                        {task.description}
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: 2,
                          fontSize: 9,
                          letterSpacing: "0.09em",
                          textTransform: "uppercase",
                          color: statusTone.color,
                          background: statusTone.bg,
                          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                        }}
                      >
                        {task.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                      <span style={{ ...monoLabel }}>
                        {task.action_type}
                      </span>
                      <span style={{ ...monoLabel }}>
                        ·
                      </span>
                      <span
                        style={{
                          ...monoLabel,
                          color: isOverdue ? "#FCA5A5" : "rgba(220,230,240,0.42)",
                        }}
                      >
                        due {fmtDate(task.due_date)}
                      </span>
                      {task.priority !== "normal" ? (
                        <>
                          <span style={{ ...monoLabel }}>·</span>
                          <span style={{ ...monoLabel, color: PRIORITY_COLOR[task.priority] }}>
                            {task.priority}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {task.notes ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "rgba(220,230,240,0.45)", lineHeight: 1.4 }}>
                        {task.notes}
                      </div>
                    ) : null}
                  </div>
                  {task.status === "pending" ? (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void completeTask(task.id)}
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          padding: "4px 10px",
                          borderRadius: 2,
                          border: "1px solid rgba(52,211,153,0.35)",
                          background: "rgba(52,211,153,0.08)",
                          color: "#34D399",
                          cursor: busy ? "not-allowed" : "pointer",
                          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        {busy ? "…" : "Done"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void skipTask(task.id)}
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          padding: "4px 10px",
                          borderRadius: 2,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "transparent",
                          color: "rgba(220,230,240,0.45)",
                          cursor: busy ? "not-allowed" : "pointer",
                          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
