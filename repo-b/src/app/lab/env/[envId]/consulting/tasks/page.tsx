"use client";

import { useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtDate } from "@/components/consulting/local-training/ui";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function TasksPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const { workspace, loading, mutating, error, updateTask } = useTrainingWorkspace(params.envId, businessId, ready);
  const [showQuickOnly, setShowQuickOnly] = useState(true);

  const tasks = useMemo(() => {
    const rows = workspace?.tasks ?? [];
    return rows.filter((task) => !showQuickOnly || task.mobile_quick_action_flag);
  }, [showQuickOnly, workspace?.tasks]);

  if (loading) return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  if (!workspace) return <EmptyState title="No tasks yet" body={error ?? "Seed the workspace to review tasks."} />;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {error ? <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm">{error}</div> : null}
      <Card>
        <CardContent className="py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Workflow G — Mobile-first task execution</CardTitle>
              <p className="mt-2 text-sm text-bm-muted2">Quick-complete actions stay tap-friendly and avoid dense enterprise tables.</p>
            </div>
            <button onClick={() => setShowQuickOnly((value) => !value)} className="rounded-full border border-bm-border px-3 py-2 text-xs text-bm-text">
              {showQuickOnly ? "Show all tasks" : "Show quick actions only"}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-bm-text">{task.task_name}</p>
                      {task.mobile_quick_action_flag ? <TonePill label="mobile quick action" tone="info" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-bm-muted2">{task.related_entity_type ?? "general"} · due {fmtDate(task.due_date)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <TonePill label={task.priority} tone={task.priority === "high" ? "warning" : "default"} />
                    <TonePill label={task.status} tone={task.status === "done" ? "success" : task.status === "in_progress" ? "info" : "default"} />
                  </div>
                </div>
                <p className="mt-3 text-sm text-bm-muted2">{task.notes}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant={task.status === "open" ? "primary" : "secondary"} onClick={() => void updateTask(task.id, "open")} disabled={mutating}>Open</Button>
                  <Button size="sm" variant={task.status === "in_progress" ? "primary" : "secondary"} onClick={() => void updateTask(task.id, "in_progress")} disabled={mutating}>In progress</Button>
                  <Button size="sm" variant={task.status === "done" ? "primary" : "secondary"} onClick={() => void updateTask(task.id, "done")} disabled={mutating}>Done</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
