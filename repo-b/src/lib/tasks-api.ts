/**
 * Tasks API client (same-origin proxy through Next route handlers).
 */

type ApiOptions = RequestInit & { params?: Record<string, string | undefined> };

async function tasksFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = new URL(path, typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      message = payload.detail || payload.message || message;
    } catch {
      // ignore parse failures
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export type TaskProject = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskBoard = {
  id: string;
  project_id: string;
  name: string;
  board_type: "kanban" | "scrum";
  created_at: string;
};

export type TaskStatus = {
  id: string;
  project_id: string;
  key: string;
  name: string;
  category: "todo" | "doing" | "done";
  order_index: number;
  color_token: string | null;
  is_default: boolean;
};

export type TaskSprint = {
  id: string;
  project_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "planned" | "active" | "closed";
  created_at: string;
};

export type TaskIssue = {
  id: string;
  project_id: string;
  project_key: string;
  issue_key: string;
  type: "task" | "bug" | "story" | "epic";
  title: string;
  description_md: string;
  status_id: string;
  status_key: string;
  status_name: string;
  status_category: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high" | "critical";
  assignee: string | null;
  reporter: string;
  labels: string[];
  estimate_points: number | null;
  due_date: string | null;
  sprint_id: string | null;
  sprint_name: string | null;
  backlog_rank: number;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  issue_id: string;
  author: string;
  body_md: string;
  created_at: string;
};

export type TaskIssueLink = {
  id: string;
  from_issue_id: string;
  from_issue_key: string;
  to_issue_id: string;
  to_issue_key: string;
  link_type: "blocks" | "blocked_by" | "relates_to" | "duplicates";
};

export type TaskAttachment = {
  id: string;
  issue_id: string;
  document_id: string;
  document_title: string | null;
  document_virtual_path: string | null;
  created_at: string;
};

export type TaskContextLink = {
  id: string;
  issue_id: string;
  link_kind:
    | "department"
    | "capability"
    | "environment"
    | "document"
    | "execution"
    | "run"
    | "report"
    | "metric";
  link_ref: string;
  link_label: string;
};

export type TaskActivity = {
  id: string;
  issue_id: string;
  actor: string;
  action: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
};

export type TaskIssueDetail = TaskIssue & {
  comments: TaskComment[];
  links: TaskIssueLink[];
  attachments: TaskAttachment[];
  context_links: TaskContextLink[];
  activity: TaskActivity[];
};

export type TaskAnalytics = {
  project_id: string;
  created_count: number;
  completed_count: number;
  wip_count: number;
  cycle_time_days: number;
  by_status: {
    status_key: string;
    status_name: string;
    category: "todo" | "doing" | "done";
    count: number;
  }[];
  throughput_by_week: { week: string; completed_count: number }[];
  cycle_time_histogram: Record<string, number>;
  top_labels: { label: string; count: number }[];
};

export type MetricsPayload = {
  generated_at: string;
  project_id: string | null;
  data_points: {
    key: string;
    value: number | Record<string, number>;
    unit: string | null;
  }[];
};

export async function listTaskProjects(): Promise<TaskProject[]> {
  return tasksFetch<TaskProject[]>("/api/tasks/projects");
}

export async function createTaskProject(body: {
  name: string;
  key: string;
  description?: string;
  board_type?: "kanban" | "scrum";
}): Promise<TaskProject> {
  return tasksFetch<TaskProject>("/api/tasks/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getTaskProjectByKey(projectKey: string): Promise<TaskProject> {
  return tasksFetch<TaskProject>(`/api/tasks/projects/key/${encodeURIComponent(projectKey)}`);
}

export async function listTaskBoards(projectId: string): Promise<TaskBoard[]> {
  return tasksFetch<TaskBoard[]>(`/api/tasks/projects/${projectId}/boards`);
}

export async function listTaskStatuses(projectId: string): Promise<TaskStatus[]> {
  return tasksFetch<TaskStatus[]>(`/api/tasks/projects/${projectId}/statuses`);
}

export async function listTaskIssues(
  projectId: string,
  filters: {
    status?: string;
    sprint?: string;
    assignee?: string;
    q?: string;
    label?: string;
    priority?: string;
  } = {}
): Promise<TaskIssue[]> {
  return tasksFetch<TaskIssue[]>(`/api/tasks/projects/${projectId}/issues`, {
    params: filters,
  });
}

export async function createTaskIssue(
  projectId: string,
  body: {
    type?: "task" | "bug" | "story" | "epic";
    title: string;
    description_md?: string;
    status_id?: string | null;
    priority?: "low" | "medium" | "high" | "critical";
    assignee?: string | null;
    reporter: string;
    labels?: string[];
    estimate_points?: number | null;
    due_date?: string | null;
    sprint_id?: string | null;
    backlog_rank?: number | null;
  }
): Promise<TaskIssue> {
  return tasksFetch<TaskIssue>(`/api/tasks/projects/${projectId}/issues`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getTaskIssue(issueId: string): Promise<TaskIssueDetail> {
  return tasksFetch<TaskIssueDetail>(`/api/tasks/issues/${issueId}`);
}

export async function patchTaskIssue(
  issueId: string,
  patch: Partial<{
    type: "task" | "bug" | "story" | "epic";
    title: string;
    description_md: string;
    status_id: string | null;
    priority: "low" | "medium" | "high" | "critical";
    assignee: string | null;
    reporter: string;
    labels: string[] | null;
    estimate_points: number | null;
    due_date: string | null;
    sprint_id: string | null;
    backlog_rank: number;
    actor: string;
  }>
): Promise<TaskIssue> {
  return tasksFetch<TaskIssue>(`/api/tasks/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function moveTaskIssue(
  issueId: string,
  body: {
    status_id?: string | null;
    sprint_id?: string | null;
    backlog_rank?: number | null;
    actor?: string;
  }
): Promise<TaskIssue> {
  return tasksFetch<TaskIssue>(`/api/tasks/issues/${issueId}/move`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addTaskComment(
  issueId: string,
  body: { author: string; body_md: string }
): Promise<TaskComment> {
  return tasksFetch<TaskComment>(`/api/tasks/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addTaskIssueLink(
  issueId: string,
  body: {
    to_issue_id: string;
    link_type: "blocks" | "blocked_by" | "relates_to" | "duplicates";
    actor?: string;
  }
): Promise<TaskIssueLink> {
  return tasksFetch<TaskIssueLink>(`/api/tasks/issues/${issueId}/links`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addTaskAttachment(
  issueId: string,
  body: { document_id: string; actor?: string }
): Promise<TaskAttachment> {
  return tasksFetch<TaskAttachment>(`/api/tasks/issues/${issueId}/attachments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addTaskContextLink(
  issueId: string,
  body: {
    link_kind:
      | "department"
      | "capability"
      | "environment"
      | "document"
      | "execution"
      | "run"
      | "report"
      | "metric";
    link_ref: string;
    link_label: string;
    actor?: string;
  }
): Promise<TaskContextLink> {
  return tasksFetch<TaskContextLink>(`/api/tasks/issues/${issueId}/context-links`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listTaskSprints(projectId: string): Promise<TaskSprint[]> {
  return tasksFetch<TaskSprint[]>(`/api/tasks/projects/${projectId}/sprints`);
}

export async function createTaskSprint(
  projectId: string,
  body: {
    name: string;
    start_date?: string | null;
    end_date?: string | null;
    status?: "planned" | "active" | "closed";
  }
): Promise<TaskSprint> {
  return tasksFetch<TaskSprint>(`/api/tasks/projects/${projectId}/sprints`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function startTaskSprint(sprintId: string): Promise<TaskSprint> {
  return tasksFetch<TaskSprint>(`/api/tasks/sprints/${sprintId}/start`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function closeTaskSprint(sprintId: string): Promise<TaskSprint> {
  return tasksFetch<TaskSprint>(`/api/tasks/sprints/${sprintId}/close`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function seedNoVendorWinstonBuild(): Promise<{
  project_id: string;
  project_key: string;
  created_project: boolean;
  created_issues: number;
  total_issues: number;
}> {
  return tasksFetch("/api/tasks/seed/novendor_winston_build", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getTaskAnalytics(projectId: string): Promise<TaskAnalytics> {
  return tasksFetch<TaskAnalytics>(`/api/tasks/projects/${projectId}/analytics`);
}

export async function getTaskMetrics(projectId?: string): Promise<MetricsPayload> {
  return tasksFetch<MetricsPayload>("/api/metrics", {
    params: { project_id: projectId },
  });
}
