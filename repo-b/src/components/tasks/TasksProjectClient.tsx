"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { askAi, checkCodexHealth as checkAiGatewayHealth } from "@/lib/commandbar/assistantApi";
import {
  addTaskAttachment,
  addTaskComment,
  addTaskContextLink,
  addTaskIssueLink,
  closeTaskSprint,
  createTaskIssue,
  createTaskSprint,
  getTaskAnalytics,
  getTaskIssue,
  getTaskMetrics,
  getTaskProjectByKey,
  listTaskIssues,
  listTaskSprints,
  listTaskStatuses,
  moveTaskIssue,
  patchTaskIssue,
  startTaskSprint,
  type MetricsPayload,
  type TaskAnalytics,
  type TaskIssue,
  type TaskIssueDetail,
  type TaskProject,
  type TaskSprint,
  type TaskStatus,
} from "@/lib/tasks-api";
import { listDocuments, type DocumentItem } from "@/lib/bos-api";
import { cn } from "@/lib/cn";

type TaskTab = "board" | "backlog" | "sprints" | "issues" | "analytics";

type Filters = {
  status?: string;
  assignee?: string;
  label?: string;
  priority?: string;
  q?: string;
};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatDate(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

async function requestTaskAiSuggestion(prompt: string) {
  const health = await checkAiGatewayHealth().catch(() => null);
  if (!health?.health.ok) {
    throw new Error(health?.health.message || "AI Gateway unavailable right now.");
  }

  const result = await askAi({ message: prompt });
  if (!result.trace.ok) {
    throw new Error(result.answer || "AI helper unavailable.");
  }

  const answer = result.answer.trim();
  if (!answer || answer === "No response from Winston.") {
    throw new Error("No AI suggestion returned.");
  }
  return answer;
}

function statusTone(statusCategory: string): string {
  if (statusCategory === "done") return "text-bm-success";
  if (statusCategory === "doing") return "text-bm-warning";
  return "text-bm-muted";
}

function IssueCard({
  issue,
  dragId,
  draggable,
  onOpen,
}: {
  issue: TaskIssue;
  dragId: string;
  draggable: boolean;
  onOpen: (issueId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !draggable,
  });
  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }
    : undefined;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      data-testid={`issue-card-${issue.issue_key}`}
      onClick={() => onOpen(issue.id)}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={cn(
        "w-full text-left rounded-xl border border-bm-border/70 bg-bm-surface/50 p-3 transition",
        "hover:border-bm-accent/35 hover:shadow-bm-glow",
        draggable && "cursor-grab",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-bm-muted2">{issue.issue_key}</p>
        <span
          className={cn(
            "text-[11px] uppercase tracking-[0.12em]",
            issue.priority === "critical" && "text-bm-danger",
            issue.priority === "high" && "text-bm-warning",
            issue.priority === "medium" && "text-bm-accent",
            issue.priority === "low" && "text-bm-muted2"
          )}
        >
          {issue.priority}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-bm-text">{issue.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-bm-muted">
        <span>{issue.type}</span>
        <span>•</span>
        <span>{issue.assignee || "Unassigned"}</span>
        {issue.labels.slice(0, 2).map((label) => (
          <span key={label} className="rounded bg-bm-surface/70 px-1.5 py-0.5">
            {label}
          </span>
        ))}
      </div>
    </button>
  );
}

function BoardColumn({
  status,
  issues,
  onOpenIssue,
}: {
  status: TaskStatus;
  issues: TaskIssue[];
  onOpenIssue: (issueId: string) => void;
}) {
  const droppableId = `status:${status.id}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      data-testid={`tasks-column-${status.key}`}
      className={cn(
        "rounded-2xl border p-3 min-h-[220px] bg-bm-surface/25",
        isOver ? "border-bm-accent/50 shadow-bm-glow" : "border-bm-border/60"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className={cn("text-xs uppercase tracking-[0.14em]", statusTone(status.category))}>
          {status.name}
        </h3>
        <span className="rounded-full bg-bm-surface/70 px-2 py-0.5 text-xs text-bm-muted">
          {issues.length}
        </span>
      </div>
      <div className="space-y-2">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            dragId={`issue:${issue.id}`}
            draggable
            onOpen={onOpenIssue}
          />
        ))}
        {issues.length === 0 && (
          <p className="rounded-xl border border-dashed border-bm-border/50 p-3 text-xs text-bm-muted2">
            Drag issues here
          </p>
        )}
      </div>
    </div>
  );
}

function BacklogSortableItem({
  issue,
  onOpenIssue,
}: {
  issue: TaskIssue;
  onOpenIssue: (issueId: string) => void;
}) {
  const sortableId = `backlog:${issue.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <IssueCard issue={issue} dragId={sortableId} draggable={false} onOpen={onOpenIssue} />
    </div>
  );
}

function SprintDropCard({
  sprint,
  issues,
  statuses,
  onOpenIssue,
  onStart,
  onClose,
}: {
  sprint: TaskSprint;
  issues: TaskIssue[];
  statuses: TaskStatus[];
  onOpenIssue: (issueId: string) => void;
  onStart: (sprintId: string) => void;
  onClose: (sprintId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint-drop:${sprint.id}` });
  const sprintCount = issues.length;
  const doneCount = issues.filter((issue) =>
    statuses.find((status) => status.id === issue.status_id)?.category === "done"
  ).length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl border bg-bm-surface/20 p-3",
        isOver ? "border-bm-accent/45 shadow-bm-glow" : "border-bm-border/70"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-bm-text">{sprint.name}</p>
          <p className="text-xs text-bm-muted">
            {sprint.status} • {doneCount}/{sprintCount} done
          </p>
        </div>
        <div className="flex gap-1">
          {sprint.status !== "active" && (
            <Button size="sm" variant="secondary" onClick={() => onStart(sprint.id)}>
              Start
            </Button>
          )}
          {sprint.status !== "closed" && (
            <Button size="sm" variant="secondary" onClick={() => onClose(sprint.id)}>
              Close
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-2">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            dragId={`sprint-item:${issue.id}`}
            draggable={false}
            onOpen={onOpenIssue}
          />
        ))}
        {sprintCount === 0 && (
          <p className="rounded-xl border border-dashed border-bm-border/50 p-3 text-xs text-bm-muted2">
            Drag backlog issues here
          </p>
        )}
      </div>
    </div>
  );
}

function NewIssueDialog({
  open,
  onOpenChange,
  project,
  statuses,
  sprints,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TaskProject | null;
  statuses: TaskStatus[];
  sprints: TaskSprint[];
  onCreated: (issue: TaskIssue) => void;
}) {
  const { push } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"task" | "bug" | "story" | "epic">("task");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [assignee, setAssignee] = useState("");
  const [labels, setLabels] = useState("");
  const [statusId, setStatusId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");

  useEffect(() => {
    if (!open) return;
    const defaultStatus = statuses.find((s) => s.is_default) || statuses[0];
    setStatusId(defaultStatus?.id || "");
    setTitle("");
    setDescription("");
    setType("task");
    setPriority("medium");
    setAssignee("");
    setLabels("");
    setSprintId("");
    setAiSuggestion("");
  }, [open, statuses]);

  const runAiAssist = async (mode: "summary" | "subtasks" | "acceptance") => {
    if (!title.trim() && !description.trim()) {
      push({
        variant: "warning",
        title: "Add issue context first",
        description: "Provide at least a title or notes before using AI assist.",
      });
      return;
    }
    setAiLoading(true);
    try {
      const promptByMode: Record<typeof mode, string> = {
        summary: "Summarize this issue and propose concrete next steps.",
        subtasks: "Turn these notes into an ordered subtask list.",
        acceptance: "Write acceptance criteria as a concise checklist.",
      };

      const prompt = [
        "You are helping draft a Winston task.",
        `Project: ${project?.name || "Unknown project"}`,
        `Issue title: ${title}`,
        `Issue notes: ${description}`,
        promptByMode[mode],
        "Respond in Markdown.",
      ].join("\n");

      setAiSuggestion(await requestTaskAiSuggestion(prompt));
    } catch (error) {
      push({
        variant: "warning",
        title: "AI Assist unavailable",
        description: error instanceof Error ? error.message : "AI helper unavailable.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async () => {
    if (!project) return;
    if (!title.trim()) return;

    setSaving(true);
    try {
      const created = await createTaskIssue(project.id, {
        type,
        title: title.trim(),
        description_md: description.trim(),
        status_id: statusId || undefined,
        priority,
        assignee: assignee.trim() || null,
        reporter: "winston_user",
        labels: parseLabels(labels),
        sprint_id: sprintId || null,
      });
      onCreated(created);
      onOpenChange(false);
      push({
        variant: "success",
        title: "Issue created",
        description: created.issue_key,
      });
    } catch (error) {
      push({
        variant: "danger",
        title: "Create issue failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Issue"
      description="Fast entry form. Use AI Assist to draft content, then confirm before saving."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : "Create Issue"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Description</label>
          <Textarea
            className="min-h-[110px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Type</label>
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="story">Story</option>
              <option value="epic">Epic</option>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Status</label>
            <Select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Sprint</label>
            <Select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">Backlog</option>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Assignee</label>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Labels</label>
            <Input
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="comma,separated"
            />
          </div>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/30 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void runAiAssist("summary")}
              disabled={aiLoading}
            >
              AI: Summarize / next steps
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void runAiAssist("subtasks")}
              disabled={aiLoading}
            >
              AI: Notes to subtasks
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void runAiAssist("acceptance")}
              disabled={aiLoading}
            >
              AI: Acceptance criteria
            </Button>
          </div>
          {aiSuggestion && (
            <div className="space-y-2">
              <Textarea className="min-h-[120px]" value={aiSuggestion} onChange={(e) => setAiSuggestion(e.target.value)} />
              <Button
                type="button"
                size="sm"
                onClick={() => setDescription((prev) => `${prev}\n\n${aiSuggestion}`.trim())}
              >
                Insert Into Description
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default function TasksProjectClient({
  projectKey,
  initialTab = "board",
}: {
  projectKey: string;
  initialTab?: TaskTab;
}) {
  const { push } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<TaskProject | null>(null);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [sprints, setSprints] = useState<TaskSprint[]>([]);
  const [issues, setIssues] = useState<TaskIssue[]>([]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [drawerIssueId, setDrawerIssueId] = useState<string | null>(null);
  const [drawerIssue, setDrawerIssue] = useState<TaskIssueDetail | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<Partial<TaskIssueDetail>>({});
  const [loading, setLoading] = useState(true);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [currentTab, setCurrentTab] = useState<TaskTab>(initialTab);
  const [analytics, setAnalytics] = useState<TaskAnalytics | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [sprintName, setSprintName] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");
  const [sprintSaving, setSprintSaving] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [linkIssueKey, setLinkIssueKey] = useState("");
  const [linkType, setLinkType] = useState<"blocks" | "blocked_by" | "relates_to" | "duplicates">("relates_to");
  const [documentId, setDocumentId] = useState("");
  const [contextKind, setContextKind] = useState<
    "department" | "capability" | "environment" | "document" | "execution" | "run" | "report" | "metric"
  >("capability");
  const [contextRef, setContextRef] = useState("");
  const [contextLabel, setContextLabel] = useState("");
  const [drawerAiLoading, setDrawerAiLoading] = useState(false);
  const [drawerAiSuggestion, setDrawerAiSuggestion] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const refreshIssues = useCallback(
    async (projectId: string, nextFilters: Filters) => {
      const next = await listTaskIssues(projectId, {
        status: nextFilters.status || undefined,
        sprint: undefined,
        assignee: nextFilters.assignee || undefined,
        q: nextFilters.q || undefined,
        label: nextFilters.label || undefined,
        priority: nextFilters.priority || undefined,
      });
      setIssues(next);
    },
    []
  );

  const refreshProject = useCallback(async () => {
    setLoading(true);
    try {
      const nextProject = await getTaskProjectByKey(projectKey);
      const [nextStatuses, nextSprints, nextIssues, nextAnalytics, nextMetrics] = await Promise.all([
        listTaskStatuses(nextProject.id),
        listTaskSprints(nextProject.id),
        listTaskIssues(nextProject.id, {}),
        getTaskAnalytics(nextProject.id),
        getTaskMetrics(nextProject.id),
      ]);
      setProject(nextProject);
      setStatuses(nextStatuses.sort((a, b) => a.order_index - b.order_index));
      setSprints(nextSprints);
      setIssues(nextIssues);
      setAnalytics(nextAnalytics);
      setMetrics(nextMetrics);
    } catch (error) {
      push({
        variant: "danger",
        title: "Could not load task project",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectKey, push]);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  const projectId = project?.id ?? null;

  useEffect(() => {
    if (!projectId) return;
    const handle = window.setTimeout(() => {
      void refreshIssues(projectId, filters);
    }, 220);
    return () => window.clearTimeout(handle);
  }, [filters, projectId, refreshIssues]);

  useEffect(() => {
    if (!drawerIssueId) {
      setDrawerIssue(null);
      return;
    }
    getTaskIssue(drawerIssueId)
      .then((issue) => {
        setDrawerIssue(issue);
        setDrawerDraft(issue);
      })
      .catch((error) => {
        push({
          variant: "danger",
          title: "Could not open issue",
          description: error instanceof Error ? error.message : "Unknown error",
        });
        setDrawerIssueId(null);
      });
  }, [drawerIssueId, push]);

  useEffect(() => {
    if (!drawerIssueId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerIssueId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerIssueId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setShowNewIssue(true);
      }
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setDrawerIssueId(null);
        setShowNewIssue(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!drawerIssueId) return;
    const businessId = typeof window === "undefined" ? null : localStorage.getItem("bos_business_id");
    if (!businessId) return;
    void listDocuments(businessId)
      .then((rows) => setDocuments(rows.slice(0, 100)))
      .catch(() => setDocuments([]));
  }, [drawerIssueId]);

  const issuesByStatus = useMemo(() => {
    const map: Record<string, TaskIssue[]> = {};
    for (const status of statuses) {
      map[status.id] = [];
    }
    for (const issue of issues) {
      if (!map[issue.status_id]) map[issue.status_id] = [];
      map[issue.status_id].push(issue);
    }
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.backlog_rank - b.backlog_rank || a.issue_key.localeCompare(b.issue_key))
    );
    return map;
  }, [issues, statuses]);

  const backlogIssues = useMemo(
    () =>
      issues
        .filter((issue) => !issue.sprint_id)
        .sort((a, b) => a.backlog_rank - b.backlog_rank || a.issue_key.localeCompare(b.issue_key)),
    [issues]
  );

  const sprintIssues = useMemo(() => {
    const map: Record<string, TaskIssue[]> = {};
    for (const sprint of sprints) map[sprint.id] = [];
    for (const issue of issues) {
      if (issue.sprint_id && map[issue.sprint_id]) {
        map[issue.sprint_id].push(issue);
      }
    }
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.backlog_rank - b.backlog_rank || a.issue_key.localeCompare(b.issue_key))
    );
    return map;
  }, [issues, sprints]);

  const activeDragIssue = useMemo(() => {
    if (!activeIssueId) return null;
    const id = activeIssueId.replace(/^issue:/, "").replace(/^backlog:/, "");
    return issues.find((issue) => issue.id === id) || null;
  }, [activeIssueId, issues]);

  const updateIssueInState = useCallback((updated: TaskIssue) => {
    setIssues((prev) => prev.map((issue) => (issue.id === updated.id ? updated : issue)));
  }, []);

  const onBoardDragStart = (event: DragStartEvent) => {
    setActiveIssueId(String(event.active.id));
  };

  const onBoardDragEnd = async (event: DragEndEvent) => {
    setActiveIssueId(null);
    if (!project) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!activeId.startsWith("issue:") || !overId || !overId.startsWith("status:")) return;

    const issueId = activeId.replace("issue:", "");
    const statusId = overId.replace("status:", "");
    const issue = issues.find((i) => i.id === issueId);
    if (!issue || issue.status_id === statusId) return;

    try {
      const updated = await moveTaskIssue(issueId, {
        status_id: statusId,
        sprint_id: issue.sprint_id,
        backlog_rank: issue.backlog_rank,
        actor: "winston_user",
      });
      updateIssueInState(updated);
      setDrawerIssue((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    } catch (error) {
      push({
        variant: "danger",
        title: "Move failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const onBacklogDragEnd = async (event: DragEndEvent) => {
    if (!project) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!activeId.startsWith("backlog:") || !overId) return;
    const issueId = activeId.replace("backlog:", "");
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    if (overId.startsWith("backlog:")) {
      const oldIndex = backlogIssues.findIndex((i) => i.id === issueId);
      const overIssueId = overId.replace("backlog:", "");
      const newIndex = backlogIssues.findIndex((i) => i.id === overIssueId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(backlogIssues, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        backlog_rank: (idx + 1) * 10,
      }));

      const changed = reordered.filter((item, idx) => item.id !== backlogIssues[idx]?.id);
      setIssues((prev) =>
        prev.map((item) => reordered.find((x) => x.id === item.id) || item)
      );

      try {
        await Promise.all(
          changed.map((item) =>
            moveTaskIssue(item.id, {
              backlog_rank: item.backlog_rank,
              sprint_id: null,
              actor: "winston_user",
            })
          )
        );
      } catch {
        void refreshIssues(project.id, filters);
      }
      return;
    }

    if (overId.startsWith("sprint-drop:")) {
      const sprintId = overId.replace("sprint-drop:", "");
      try {
        const updated = await moveTaskIssue(issueId, {
          sprint_id: sprintId,
          backlog_rank: issue.backlog_rank,
          actor: "winston_user",
        });
        updateIssueInState(updated);
      } catch (error) {
        push({
          variant: "danger",
          title: "Sprint planning move failed",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
      return;
    }
  };

  const saveDrawerIssue = async () => {
    if (!drawerIssue) return;
    try {
      const updated = await patchTaskIssue(drawerIssue.id, {
        title: String(drawerDraft.title || "").trim(),
        description_md: String(drawerDraft.description_md || ""),
        status_id: (drawerDraft.status_id as string) || null,
        assignee: (drawerDraft.assignee as string) || null,
        priority: (drawerDraft.priority as TaskIssue["priority"]) || "medium",
        labels: Array.isArray(drawerDraft.labels) ? drawerDraft.labels : parseLabels(String(drawerDraft.labels || "")),
        estimate_points:
          drawerDraft.estimate_points === null ||
          drawerDraft.estimate_points === undefined ||
          Number.isNaN(Number(drawerDraft.estimate_points))
            ? null
            : Number(drawerDraft.estimate_points),
        due_date: drawerDraft.due_date ? String(drawerDraft.due_date) : null,
        sprint_id: (drawerDraft.sprint_id as string) || null,
        actor: "winston_user",
      });
      updateIssueInState(updated);
      const full = await getTaskIssue(updated.id);
      setDrawerIssue(full);
      setDrawerDraft(full);
      push({ variant: "success", title: "Issue updated" });
    } catch (error) {
      push({
        variant: "danger",
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addDrawerComment = async () => {
    if (!drawerIssue || !commentDraft.trim()) return;
    try {
      await addTaskComment(drawerIssue.id, { author: "winston_user", body_md: commentDraft.trim() });
      const full = await getTaskIssue(drawerIssue.id);
      setDrawerIssue(full);
      setDrawerDraft(full);
      setCommentDraft("");
    } catch (error) {
      push({
        variant: "danger",
        title: "Comment failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addDrawerLink = async () => {
    if (!drawerIssue || !linkIssueKey.trim()) return;
    const target = issues.find((issue) => issue.issue_key.toLowerCase() === linkIssueKey.trim().toLowerCase());
    if (!target) {
      push({
        variant: "warning",
        title: "Issue key not found",
        description: "Use an issue key from this project (example: WIN-12).",
      });
      return;
    }
    try {
      await addTaskIssueLink(drawerIssue.id, {
        to_issue_id: target.id,
        link_type: linkType,
        actor: "winston_user",
      });
      const full = await getTaskIssue(drawerIssue.id);
      setDrawerIssue(full);
      setDrawerDraft(full);
      setLinkIssueKey("");
    } catch (error) {
      push({
        variant: "danger",
        title: "Link failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addDrawerAttachment = async () => {
    if (!drawerIssue || !documentId.trim()) return;
    try {
      await addTaskAttachment(drawerIssue.id, { document_id: documentId.trim(), actor: "winston_user" });
      const full = await getTaskIssue(drawerIssue.id);
      setDrawerIssue(full);
      setDrawerDraft(full);
      setDocumentId("");
    } catch (error) {
      push({
        variant: "danger",
        title: "Attach failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addDrawerContextLink = async () => {
    if (!drawerIssue || !contextRef.trim() || !contextLabel.trim()) return;
    try {
      await addTaskContextLink(drawerIssue.id, {
        link_kind: contextKind,
        link_ref: contextRef.trim(),
        link_label: contextLabel.trim(),
        actor: "winston_user",
      });
      const full = await getTaskIssue(drawerIssue.id);
      setDrawerIssue(full);
      setDrawerDraft(full);
      setContextRef("");
      setContextLabel("");
    } catch (error) {
      push({
        variant: "danger",
        title: "Context link failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const runDrawerAi = async (mode: "summary" | "subtasks" | "acceptance") => {
    if (!drawerIssue) return;
    setDrawerAiLoading(true);
    try {
      const instruction: Record<typeof mode, string> = {
        summary: "Summarize this issue and propose next steps.",
        subtasks: "Create subtasks from this issue details.",
        acceptance: "Write acceptance criteria checklist for this issue.",
      };
      const prompt = [
        `Project: ${project?.name || projectKey}`,
        `Issue: ${drawerIssue.issue_key} ${drawerIssue.title}`,
        `Description: ${drawerIssue.description_md}`,
        instruction[mode],
        "Respond in Markdown.",
      ].join("\n");
      setDrawerAiSuggestion(await requestTaskAiSuggestion(prompt));
    } catch (error) {
      push({
        variant: "warning",
        title: "AI Assist unavailable",
        description: error instanceof Error ? error.message : "AI helper unavailable.",
      });
    } finally {
      setDrawerAiLoading(false);
    }
  };

  const createSprintNow = async () => {
    if (!project || !sprintName.trim()) return;
    setSprintSaving(true);
    try {
      const created = await createTaskSprint(project.id, {
        name: sprintName.trim(),
        start_date: sprintStart || null,
        end_date: sprintEnd || null,
        status: "planned",
      });
      setSprints((prev) => [created, ...prev]);
      setSprintName("");
      setSprintStart("");
      setSprintEnd("");
      push({ variant: "success", title: "Sprint created" });
    } catch (error) {
      push({
        variant: "danger",
        title: "Sprint create failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSprintSaving(false);
    }
  };

  const tabNav: { key: TaskTab; label: string }[] = [
    { key: "board", label: "Board" },
    { key: "backlog", label: "Backlog" },
    { key: "sprints", label: "Sprints" },
    { key: "issues", label: "Issues" },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <main className="mx-auto max-w-[1320px] px-3 py-4 sm:px-5 sm:py-6 space-y-4">
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4 sm:p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Tasks Project</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold text-bm-text">
          {project?.name || projectKey}
        </h1>
        <p className="mt-2 text-sm text-bm-muted">
          Keyboard: <code>N</code> new issue, <code>/</code> search, <code>Esc</code> close drawer.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        {tabNav.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="sm"
            variant={currentTab === tab.key ? "primary" : "secondary"}
            onClick={() => setCurrentTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            data-testid="filter-search"
            placeholder="Search issues"
            className="w-[220px] h-10 rounded-lg bg-bm-surface/60 border border-bm-border/80 px-3 text-sm text-bm-text placeholder:text-bm-muted2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/60"
            value={filters.q || ""}
            ref={searchRef}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
          />
          <Button data-testid="new-issue" type="button" onClick={() => setShowNewIssue(true)}>
            New Issue
          </Button>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-4">
        <Select
          value={filters.status || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value || undefined }))}
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.key}>
              {status.name}
            </option>
          ))}
        </Select>
        <Input
          value={filters.assignee || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value || undefined }))}
          placeholder="Assignee"
        />
        <Input
          value={filters.label || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, label: e.target.value || undefined }))}
          placeholder="Label"
        />
        <Select
          value={filters.priority || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value || undefined }))}
        >
          <option value="">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
      </section>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/30 animate-pulse" />
          <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/30 animate-pulse" />
          <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/30 animate-pulse" />
        </div>
      )}

      {!loading && currentTab === "board" && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onBoardDragStart}
          onDragEnd={(event) => void onBoardDragEnd(event)}
        >
          <section data-testid="tasks-board" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {statuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                issues={issuesByStatus[status.id] || []}
                onOpenIssue={setDrawerIssueId}
              />
            ))}
          </section>
          <DragOverlay>
            {activeDragIssue ? (
              <div className="w-[280px]">
                <IssueCard
                  issue={activeDragIssue}
                  dragId={`overlay:${activeDragIssue.id}`}
                  draggable={false}
                  onOpen={() => undefined}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {!loading && currentTab === "backlog" && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => void onBacklogDragEnd(event)}
        >
          <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-bm-text">Backlog</h2>
                <span className="text-xs text-bm-muted">{backlogIssues.length} issues</span>
              </div>
              <div data-testid="backlog-list" className="space-y-2">
                <SortableContext
                  items={backlogIssues.map((issue) => `backlog:${issue.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {backlogIssues.map((issue) => (
                    <BacklogSortableItem key={issue.id} issue={issue} onOpenIssue={setDrawerIssueId} />
                  ))}
                </SortableContext>
                {backlogIssues.length === 0 && (
                  <p className="rounded-xl border border-dashed border-bm-border/50 p-3 text-xs text-bm-muted2">
                    No backlog issues
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Card>
                <CardContent className="space-y-2">
                  <CardTitle className="text-base">Create Sprint</CardTitle>
                  <div className="space-y-2">
                    <Input
                      placeholder="Sprint name"
                      value={sprintName}
                      onChange={(e) => setSprintName(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" value={sprintStart} onChange={(e) => setSprintStart(e.target.value)} />
                      <Input type="date" value={sprintEnd} onChange={(e) => setSprintEnd(e.target.value)} />
                    </div>
                    <Button
                      data-testid="sprint-create"
                      type="button"
                      disabled={sprintSaving || !sprintName.trim()}
                      onClick={() => void createSprintNow()}
                    >
                      {sprintSaving ? "Creating..." : "Create Sprint"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {sprints.map((sprint) => (
                <SprintDropCard
                  key={sprint.id}
                  sprint={sprint}
                  issues={sprintIssues[sprint.id] || []}
                  statuses={statuses}
                  onOpenIssue={setDrawerIssueId}
                  onStart={(sprintId) =>
                    void startTaskSprint(sprintId)
                      .then((next) =>
                        setSprints((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                      )
                      .catch(() => undefined)
                  }
                  onClose={(sprintId) =>
                    void closeTaskSprint(sprintId)
                      .then((next) => {
                        setSprints((prev) => prev.map((item) => (item.id === next.id ? next : item)));
                        if (project) void refreshIssues(project.id, filters);
                      })
                      .catch(() => undefined)
                  }
                />
              ))}
            </div>
          </section>
        </DndContext>
      )}

      {!loading && currentTab === "sprints" && (
        <section className="space-y-3">
          {sprints.map((sprint) => {
            const sprintRows = sprintIssues[sprint.id] || [];
            const summary: Record<string, number> = {};
            for (const status of statuses) summary[status.key] = 0;
            for (const issue of sprintRows) {
              const key = statuses.find((status) => status.id === issue.status_id)?.key || "unknown";
              summary[key] = (summary[key] || 0) + 1;
            }
            return (
              <Card key={sprint.id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{sprint.name}</CardTitle>
                      <CardDescription>
                        {sprint.status} • {sprint.start_date || "?"} to {sprint.end_date || "?"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {sprint.status !== "active" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void startTaskSprint(sprint.id)
                              .then((next) =>
                                setSprints((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                              )
                              .catch(() => undefined)
                          }
                        >
                          Start
                        </Button>
                      )}
                      {sprint.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void closeTaskSprint(sprint.id)
                              .then((next) => {
                                setSprints((prev) => prev.map((item) => (item.id === next.id ? next : item)));
                                if (project) void refreshIssues(project.id, filters);
                              })
                              .catch(() => undefined)
                          }
                        >
                          Close
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {statuses.map((status) => (
                      <div key={status.id} className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">{status.name}</p>
                        <p className="text-lg font-semibold">{summary[status.key] || 0}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {sprints.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-sm text-bm-muted">No sprints yet.</p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {!loading && currentTab === "issues" && (
        <section className="space-y-2">
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => setDrawerIssueId(issue.id)}
              className="w-full rounded-xl border border-bm-border/70 bg-bm-surface/30 p-3 text-left hover:border-bm-accent/35 hover:shadow-bm-glow transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-bm-text">
                  {issue.issue_key} • {issue.title}
                </p>
                <p className="text-xs text-bm-muted">{issue.status_name}</p>
              </div>
              <p className="mt-1 text-xs text-bm-muted">
                {issue.assignee || "Unassigned"} • due {formatDate(issue.due_date)}
              </p>
            </button>
          ))}
          {issues.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-sm text-bm-muted">No matching issues.</p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {!loading && currentTab === "analytics" && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent>
                <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Created</p>
                <p className="mt-2 text-2xl font-semibold">{analytics?.created_count || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Completed</p>
                <p className="mt-2 text-2xl font-semibold">{analytics?.completed_count || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">WIP</p>
                <p className="mt-2 text-2xl font-semibold">{analytics?.wip_count || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Cycle Time (days)</p>
                <p className="mt-2 text-2xl font-semibold">{(analytics?.cycle_time_days || 0).toFixed(1)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent>
                <CardTitle className="text-base">WIP by Status</CardTitle>
                <div className="mt-3 space-y-2">
                  {(analytics?.by_status || []).map((row) => (
                    <div key={row.status_key} className="flex items-center gap-2">
                      <div className="w-28 text-xs text-bm-muted">{row.status_name}</div>
                      <div className="h-2 flex-1 rounded bg-bm-surface/70 overflow-hidden">
                        <div
                          className="h-full bg-bm-accent/70"
                          style={{ width: `${Math.min(100, row.count * 12)}%` }}
                        />
                      </div>
                      <div className="w-8 text-right text-xs text-bm-text">{row.count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <CardTitle className="text-base">Throughput by Week</CardTitle>
                <div className="mt-3 space-y-2">
                  {(analytics?.throughput_by_week || []).map((point) => (
                    <div key={point.week} className="flex items-center gap-2">
                      <div className="w-24 text-xs text-bm-muted">{point.week}</div>
                      <div className="h-2 flex-1 rounded bg-bm-surface/70 overflow-hidden">
                        <div
                          className="h-full bg-bm-success/70"
                          style={{ width: `${Math.min(100, point.completed_count * 16)}%` }}
                        />
                      </div>
                      <div className="w-8 text-right text-xs text-bm-text">{point.completed_count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent>
              <CardTitle className="text-base">Top Labels</CardTitle>
              <div className="mt-3 flex flex-wrap gap-2">
                {(analytics?.top_labels || []).map((row) => (
                  <span
                    key={row.label}
                    className="rounded-full border border-bm-border/70 bg-bm-surface/45 px-2.5 py-1 text-xs text-bm-muted"
                  >
                    {row.label} ({row.count})
                  </span>
                ))}
                {(analytics?.top_labels || []).length === 0 && (
                  <p className="text-sm text-bm-muted">No labels yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <CardTitle className="text-base">Metrics Data Points</CardTitle>
              <div className="mt-3 space-y-2">
                {(metrics?.data_points || []).map((point) => (
                  <div
                    key={point.key}
                    className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2 text-xs"
                  >
                    <p className="font-semibold text-bm-text">{point.key}</p>
                    <p className="text-bm-muted">
                      {typeof point.value === "number" ? point.value : JSON.stringify(point.value)}
                      {point.unit ? ` ${point.unit}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <NewIssueDialog
        open={showNewIssue}
        onOpenChange={setShowNewIssue}
        project={project}
        statuses={statuses}
        sprints={sprints}
        onCreated={(created) => {
          setIssues((prev) => [created, ...prev]);
          if (project) {
            void Promise.all([getTaskAnalytics(project.id), getTaskMetrics(project.id)]).then(
              ([nextAnalytics, nextMetrics]) => {
                setAnalytics(nextAnalytics);
                setMetrics(nextMetrics);
              }
            );
          }
        }}
      />

      {drawerIssue && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerIssueId(null)} aria-hidden />
          <aside
            data-testid="issue-drawer"
            className="relative h-full w-full max-w-[680px] overflow-y-auto border-l border-bm-border/70 bg-bm-bg p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-bm-muted2">{drawerIssue.issue_key}</p>
              <Button variant="secondary" size="sm" onClick={() => setDrawerIssueId(null)}>
                Close
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <Input
                value={String(drawerDraft.title || "")}
                onChange={(e) => setDrawerDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
              <Textarea
                className="min-h-[120px]"
                value={String(drawerDraft.description_md || "")}
                onChange={(e) => setDrawerDraft((prev) => ({ ...prev, description_md: e.target.value }))}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={String(drawerDraft.status_id || "")}
                  onChange={(e) => setDrawerDraft((prev) => ({ ...prev, status_id: e.target.value }))}
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={String(drawerDraft.priority || "medium")}
                  onChange={(e) =>
                    setDrawerDraft((prev) => ({ ...prev, priority: e.target.value as TaskIssue["priority"] }))
                  }
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
                <Input
                  value={String(drawerDraft.assignee || "")}
                  placeholder="Assignee"
                  onChange={(e) => setDrawerDraft((prev) => ({ ...prev, assignee: e.target.value }))}
                />
                <Input
                  value={Array.isArray(drawerDraft.labels) ? drawerDraft.labels.join(", ") : ""}
                  placeholder="labels,comma,separated"
                  onChange={(e) =>
                    setDrawerDraft((prev) => ({
                      ...prev,
                      labels: parseLabels(e.target.value),
                    }))
                  }
                />
                <Input
                  type="number"
                  value={String(drawerDraft.estimate_points ?? "")}
                  placeholder="Estimate points"
                  onChange={(e) =>
                    setDrawerDraft((prev) => ({
                      ...prev,
                      estimate_points: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
                <Input
                  type="date"
                  value={String(drawerDraft.due_date || "")}
                  onChange={(e) => setDrawerDraft((prev) => ({ ...prev, due_date: e.target.value || null }))}
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => void saveDrawerIssue()}>
                  Save
                </Button>
              </div>
            </div>

            <Card className="mt-4">
              <CardContent className="space-y-2">
                <CardTitle className="text-base">AI Assist</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void runDrawerAi("summary")} disabled={drawerAiLoading}>
                    Summarize / next steps
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void runDrawerAi("subtasks")} disabled={drawerAiLoading}>
                    Notes into subtasks
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void runDrawerAi("acceptance")} disabled={drawerAiLoading}>
                    Acceptance criteria
                  </Button>
                </div>
                {drawerAiSuggestion && (
                  <div className="space-y-2">
                    <Textarea
                      className="min-h-[120px]"
                      value={drawerAiSuggestion}
                      onChange={(e) => setDrawerAiSuggestion(e.target.value)}
                    />
                    <Button
                      size="sm"
                      type="button"
                      onClick={() =>
                        setDrawerDraft((prev) => ({
                          ...prev,
                          description_md: `${String(prev.description_md || "")}\n\n${drawerAiSuggestion}`.trim(),
                        }))
                      }
                    >
                      Apply To Description
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="space-y-2">
                <CardTitle className="text-base">Comments</CardTitle>
                <div className="space-y-2">
                  {drawerIssue.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2">
                      <p className="text-xs text-bm-muted2">
                        {comment.author} • {new Date(comment.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 text-sm text-bm-text whitespace-pre-wrap">{comment.body_md}</p>
                    </div>
                  ))}
                </div>
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment"
                />
                <Button size="sm" type="button" onClick={() => void addDrawerComment()}>
                  Add Comment
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="space-y-2">
                <CardTitle className="text-base">Links</CardTitle>
                <div className="space-y-1">
                  {drawerIssue.links.map((link) => (
                    <p key={link.id} className="text-sm text-bm-muted">
                      {link.from_issue_key} {link.link_type} {link.to_issue_key}
                    </p>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    value={linkIssueKey}
                    onChange={(e) => setLinkIssueKey(e.target.value)}
                    placeholder="Target issue key (WIN-123)"
                  />
                  <Select value={linkType} onChange={(e) => setLinkType(e.target.value as typeof linkType)}>
                    <option value="relates_to">relates_to</option>
                    <option value="blocks">blocks</option>
                    <option value="blocked_by">blocked_by</option>
                    <option value="duplicates">duplicates</option>
                  </Select>
                  <Button size="sm" type="button" onClick={() => void addDrawerLink()}>
                    Add Link
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="space-y-2">
                <CardTitle className="text-base">Attachments</CardTitle>
                <div className="space-y-1">
                  {drawerIssue.attachments.map((attachment) => (
                    <p key={attachment.id} className="text-sm text-bm-muted">
                      {attachment.document_title || attachment.document_id}
                    </p>
                  ))}
                </div>
                {documents.length > 0 ? (
                  <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                    <option value="">Select document</option>
                    {documents.map((doc) => (
                      <option key={doc.document_id} value={doc.document_id}>
                        {doc.title}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                    placeholder="Document ID"
                  />
                )}
                <Button size="sm" type="button" onClick={() => void addDrawerAttachment()}>
                  Attach Document
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="space-y-2">
                <CardTitle className="text-base">Context Links</CardTitle>
                <div className="space-y-1">
                  {drawerIssue.context_links.map((link) => (
                    <p key={link.id} className="text-sm text-bm-muted">
                      {link.link_kind}: {link.link_label} ({link.link_ref})
                    </p>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select value={contextKind} onChange={(e) => setContextKind(e.target.value as typeof contextKind)}>
                    <option value="department">department</option>
                    <option value="capability">capability</option>
                    <option value="environment">environment</option>
                    <option value="document">document</option>
                    <option value="execution">execution</option>
                    <option value="run">run</option>
                    <option value="report">report</option>
                    <option value="metric">metric</option>
                  </Select>
                  <Input
                    value={contextRef}
                    onChange={(e) => setContextRef(e.target.value)}
                    placeholder="Reference (id/key)"
                  />
                  <Input
                    value={contextLabel}
                    onChange={(e) => setContextLabel(e.target.value)}
                    placeholder="Label"
                  />
                </div>
                <Button size="sm" type="button" onClick={() => void addDrawerContextLink()}>
                  Add Context Link
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4 mb-6">
              <CardContent>
                <CardTitle className="text-base">Activity</CardTitle>
                <div className="mt-2 space-y-1">
                  {drawerIssue.activity.map((entry) => (
                    <p key={entry.id} className="text-xs text-bm-muted">
                      {new Date(entry.created_at).toLocaleString()} • {entry.actor} • {entry.action}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </main>
  );
}
