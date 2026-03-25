import { expect, test } from "@playwright/test";

type Project = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type Status = {
  id: string;
  project_id: string;
  key: string;
  name: string;
  category: "todo" | "doing" | "done";
  order_index: number;
  color_token: string | null;
  is_default: boolean;
};

type Sprint = {
  id: string;
  project_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "planned" | "active" | "closed";
  created_at: string;
};

type Issue = {
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

type Comment = {
  id: string;
  issue_id: string;
  author: string;
  body_md: string;
  created_at: string;
};

const nowIso = () => new Date().toISOString();

test.beforeEach(async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: "demo_lab_session",
      value: "active",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const projects: Project[] = [];
  const sprints: Sprint[] = [];
  const issues: Issue[] = [];
  const commentsByIssue = new Map<string, Comment[]>();

  let issueCounter = 0;
  let projectCounter = 0;

  const defaultStatuses = (projectId: string): Status[] => [
    {
      id: `${projectId}-todo`,
      project_id: projectId,
      key: "todo",
      name: "To Do",
      category: "todo",
      order_index: 10,
      color_token: null,
      is_default: true,
    },
    {
      id: `${projectId}-in-progress`,
      project_id: projectId,
      key: "in_progress",
      name: "In Progress",
      category: "doing",
      order_index: 20,
      color_token: null,
      is_default: false,
    },
    {
      id: `${projectId}-done`,
      project_id: projectId,
      key: "done",
      name: "Done",
      category: "done",
      order_index: 30,
      color_token: null,
      is_default: false,
    },
  ];

  const statusForIssue = (issue: Issue, projectId: string) => {
    const statuses = defaultStatuses(projectId);
    const status = statuses.find((s) => s.id === issue.status_id) || statuses[0];
    issue.status_key = status.key;
    issue.status_name = status.name;
    issue.status_category = status.category;
  };

  await page.route("**/api/tasks/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const urlObj = new URL(request.url());
    const path = urlObj.pathname;

    const parseBody = () => {
      const raw = request.postData();
      if (!raw) return {};
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    if (path === "/api/tasks/projects" && method === "GET") {
      await route.fulfill({ json: projects });
      return;
    }

    if (path === "/api/tasks/projects" && method === "POST") {
      const body = parseBody();
      projectCounter += 1;
      const now = nowIso();
      const project: Project = {
        id: `project-${projectCounter}`,
        name: String(body.name || "Untitled"),
        key: String(body.key || `PRJ${projectCounter}`),
        description: (body.description as string | null) || null,
        created_at: now,
        updated_at: now,
      };
      projects.unshift(project);
      await route.fulfill({ status: 200, json: project });
      return;
    }

    if (path.startsWith("/api/tasks/projects/key/") && method === "GET") {
      const key = decodeURIComponent(path.split("/").pop() || "");
      const project = projects.find((p) => p.key === key);
      if (!project) {
        await route.fulfill({ status: 404, json: { detail: "Project not found" } });
        return;
      }
      await route.fulfill({ json: project });
      return;
    }

    const statusesMatch = path.match(/^\/api\/tasks\/projects\/([^/]+)\/statuses$/);
    if (statusesMatch && method === "GET") {
      await route.fulfill({ json: defaultStatuses(statusesMatch[1]) });
      return;
    }

    const sprintsMatch = path.match(/^\/api\/tasks\/projects\/([^/]+)\/sprints$/);
    if (sprintsMatch && method === "GET") {
      const projectId = sprintsMatch[1];
      await route.fulfill({ json: sprints.filter((s) => s.project_id === projectId) });
      return;
    }

    const issuesMatch = path.match(/^\/api\/tasks\/projects\/([^/]+)\/issues$/);
    if (issuesMatch && method === "GET") {
      const projectId = issuesMatch[1];
      let rows = issues.filter((issue) => issue.project_id === projectId);
      const q = (urlObj.searchParams.get("q") || "").toLowerCase();
      if (q) {
        rows = rows.filter(
          (issue) =>
            issue.title.toLowerCase().includes(q) ||
            issue.issue_key.toLowerCase().includes(q) ||
            issue.description_md.toLowerCase().includes(q)
        );
      }
      const status = urlObj.searchParams.get("status");
      if (status) {
        rows = rows.filter((issue) => issue.status_key === status || issue.status_id === status);
      }
      const assignee = urlObj.searchParams.get("assignee");
      if (assignee) {
        rows = rows.filter((issue) => issue.assignee === assignee);
      }
      const label = urlObj.searchParams.get("label");
      if (label) {
        rows = rows.filter((issue) => issue.labels.includes(label));
      }
      const priority = urlObj.searchParams.get("priority");
      if (priority) {
        rows = rows.filter((issue) => issue.priority === priority);
      }
      rows = rows.sort((a, b) => a.backlog_rank - b.backlog_rank);
      await route.fulfill({ json: rows });
      return;
    }

    if (issuesMatch && method === "POST") {
      const projectId = issuesMatch[1];
      const project = projects.find((p) => p.id === projectId);
      const statuses = defaultStatuses(projectId);
      const body = parseBody();
      issueCounter += 1;
      const now = nowIso();
      const status =
        statuses.find((s) => s.id === body.status_id) ||
        statuses.find((s) => s.is_default) ||
        statuses[0];
      const issue: Issue = {
        id: `issue-${issueCounter}`,
        project_id: projectId,
        project_key: project?.key || "WIN",
        issue_key: `${project?.key || "WIN"}-${issueCounter}`,
        type: (body.type as Issue["type"]) || "task",
        title: String(body.title || "Untitled"),
        description_md: String(body.description_md || ""),
        status_id: status.id,
        status_key: status.key,
        status_name: status.name,
        status_category: status.category,
        priority: (body.priority as Issue["priority"]) || "medium",
        assignee: (body.assignee as string | null) || null,
        reporter: String(body.reporter || "winston_user"),
        labels: Array.isArray(body.labels) ? (body.labels as string[]) : [],
        estimate_points: (body.estimate_points as number | null) || null,
        due_date: (body.due_date as string | null) || null,
        sprint_id: (body.sprint_id as string | null) || null,
        sprint_name: null,
        backlog_rank: Number(body.backlog_rank || issueCounter * 10),
        created_at: now,
        updated_at: now,
      };
      issues.push(issue);
      commentsByIssue.set(issue.id, []);
      await route.fulfill({ status: 200, json: issue });
      return;
    }

    const moveMatch = path.match(/^\/api\/tasks\/issues\/([^/]+)\/move$/);
    if (moveMatch && method === "POST") {
      const issue = issues.find((item) => item.id === moveMatch[1]);
      if (!issue) {
        await route.fulfill({ status: 404, json: { detail: "Issue not found" } });
        return;
      }
      const body = parseBody();
      if (body.status_id) {
        issue.status_id = String(body.status_id);
        statusForIssue(issue, issue.project_id);
      }
      if (Object.prototype.hasOwnProperty.call(body, "sprint_id")) {
        issue.sprint_id = (body.sprint_id as string | null) || null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "backlog_rank")) {
        issue.backlog_rank = Number(body.backlog_rank || issue.backlog_rank);
      }
      issue.updated_at = nowIso();
      await route.fulfill({ status: 200, json: issue });
      return;
    }

    const issueDetailMatch = path.match(/^\/api\/tasks\/issues\/([^/]+)$/);
    if (issueDetailMatch && method === "GET") {
      const issue = issues.find((item) => item.id === issueDetailMatch[1]);
      if (!issue) {
        await route.fulfill({ status: 404, json: { detail: "Issue not found" } });
        return;
      }
      await route.fulfill({
        status: 200,
        json: {
          ...issue,
          comments: commentsByIssue.get(issue.id) || [],
          links: [],
          attachments: [],
          context_links: [],
          activity: [],
        },
      });
      return;
    }

    if (issueDetailMatch && method === "PATCH") {
      const issue = issues.find((item) => item.id === issueDetailMatch[1]);
      if (!issue) {
        await route.fulfill({ status: 404, json: { detail: "Issue not found" } });
        return;
      }
      const body = parseBody();
      Object.assign(issue, body);
      if (Object.prototype.hasOwnProperty.call(body, "status_id")) {
        statusForIssue(issue, issue.project_id);
      }
      issue.updated_at = nowIso();
      await route.fulfill({ status: 200, json: issue });
      return;
    }

    const commentMatch = path.match(/^\/api\/tasks\/issues\/([^/]+)\/comments$/);
    if (commentMatch && method === "POST") {
      const issueId = commentMatch[1];
      const issue = issues.find((item) => item.id === issueId);
      if (!issue) {
        await route.fulfill({ status: 404, json: { detail: "Issue not found" } });
        return;
      }
      const body = parseBody();
      const comments = commentsByIssue.get(issueId) || [];
      const comment: Comment = {
        id: `comment-${comments.length + 1}`,
        issue_id: issueId,
        author: String(body.author || "winston_user"),
        body_md: String(body.body_md || ""),
        created_at: nowIso(),
      };
      comments.push(comment);
      commentsByIssue.set(issueId, comments);
      await route.fulfill({ status: 200, json: comment });
      return;
    }

    const analyticsMatch = path.match(/^\/api\/tasks\/projects\/([^/]+)\/analytics$/);
    if (analyticsMatch && method === "GET") {
      const projectId = analyticsMatch[1];
      const statuses = defaultStatuses(projectId);
      const rows = issues.filter((issue) => issue.project_id === projectId);
      const byStatus = statuses.map((status) => ({
        status_key: status.key,
        status_name: status.name,
        category: status.category,
        count: rows.filter((issue) => issue.status_id === status.id).length,
      }));
      await route.fulfill({
        status: 200,
        json: {
          project_id: projectId,
          created_count: rows.length,
          completed_count: rows.filter((issue) => issue.status_category === "done").length,
          wip_count: rows.filter((issue) => issue.status_category === "doing").length,
          cycle_time_days: 2.5,
          by_status: byStatus,
          throughput_by_week: [{ week: "2026-02-09", completed_count: byStatus[2].count }],
          cycle_time_histogram: { "0-2": 1, "3-7": 0, "8-14": 0, "15+": 0 },
          top_labels: [{ label: "qa", count: 1 }],
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: "Unhandled tasks route in test" } });
  });

  await page.route("**/api/metrics**", async (route) => {
    const rows = issues.length;
    await route.fulfill({
      json: {
        generated_at: nowIso(),
        project_id: null,
        data_points: [
          { key: "tasks.created_count", value: rows, unit: "count" },
          {
            key: "tasks.completed_count",
            value: issues.filter((issue) => issue.status_category === "done").length,
            unit: "count",
          },
          { key: "tasks.cycle_time_days", value: 2.5, unit: "days" },
          {
            key: "tasks.wip_count",
            value: issues.filter((issue) => issue.status_category === "doing").length,
            unit: "count",
          },
          { key: "tasks.by_status", value: { todo: 0, in_progress: 0, done: 0 }, unit: null },
        ],
      },
    });
  });
});

test("tasks flow: create project, add issue, drag across columns, edit and persist", async ({
  page,
}) => {
  await page.goto("/tasks");
  await expect(page.getByTestId("tasks-project-list")).toBeVisible();

  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByTestId("tasks-open-project-WIN")).toBeVisible();

  await page.getByTestId("tasks-open-project-WIN").click();
  await expect(page.getByTestId("tasks-board")).toBeVisible();

  await page.getByTestId("new-issue").click();
  const dialog = page.getByRole("dialog", { name: "New Issue" });
  await expect(dialog).toBeVisible();
  await dialog.locator("input").first().fill("End-to-end Task");
  await dialog.locator("textarea").first().fill("Validate board drag and drawer edits.");
  const createIssueButton = dialog.getByRole("button", { name: "Create Issue" });
  await createIssueButton.scrollIntoViewIfNeeded();
  await createIssueButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const issueCard = page.getByTestId("issue-card-WIN-1");
  await expect(issueCard).toBeVisible();

  const source = await issueCard.boundingBox();
  const target = await page.getByTestId("tasks-column-done").boundingBox();
  if (!source || !target) throw new Error("Missing drag coordinates");
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x + 30, target.y + 40, { steps: 20 });
  await page.mouse.up();

  const doneCard = page.getByTestId("tasks-column-done").getByTestId("issue-card-WIN-1");
  await expect(doneCard).toBeVisible();

  await doneCard.click();
  const drawer = page.getByTestId("issue-drawer");
  await expect(drawer).toBeVisible();

  await drawer.getByPlaceholder("Assignee").fill("qa_owner");
  await drawer.getByRole("button", { name: "Save" }).click();

  await drawer.getByPlaceholder("Add a comment").fill("Looks good after drag.");
  await drawer.getByRole("button", { name: "Add Comment" }).click();
  await expect(drawer.getByText("Looks good after drag.")).toBeVisible();

  await drawer.getByRole("button", { name: "Close" }).click();
  await page.reload();

  await expect(page.getByTestId("tasks-column-done").getByTestId("issue-card-WIN-1")).toBeVisible();
});
