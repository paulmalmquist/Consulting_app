# Tasks Module (Winston Jira-style v1)

## Scope
Winston now includes a production-shaped Tasks module for managing Winston work itself:
- Projects
- Boards (Kanban/Scrum)
- Status workflows
- Backlog ordering
- Sprint planning
- Issue detail drawer (fields/comments/links/attachments/context links/activity)
- Analytics + metrics datapoints
- NoVendor seed project (`WIN`)

## Architecture
- Backend: FastAPI routes under `/api/tasks/*`
- Frontend: Next.js routes under `/tasks` and `/tasks/[projectKey]`
- DB migration: `repo-b/db/migrations/007_tasks_module.sql`
- Metrics endpoint: `/api/metrics` (includes `tasks.*` datapoints)

## Database Objects (app schema)
- `task_project`
- `task_board`
- `task_status`
- `task_sprint`
- `task_issue`
- `task_comment`
- `task_activity`
- `task_issue_link`
- `task_issue_attachment`
- `task_issue_context_link`

Indexes include:
- `task_issue(project_id, issue_key)`
- `task_issue(project_id, status_id, sprint_id)`
- `GIN(labels)` on `task_issue.labels`
- Full-text GIN index on issue title/description

## API Endpoints
Projects:
- `GET /api/tasks/projects`
- `POST /api/tasks/projects`
- `GET /api/tasks/projects/{project_id}`

Statuses:
- `GET /api/tasks/projects/{project_id}/statuses`
- `POST /api/tasks/projects/{project_id}/statuses`

Issues:
- `GET /api/tasks/projects/{project_id}/issues?status=&sprint=&assignee=&q=&label=&priority=`
- `POST /api/tasks/projects/{project_id}/issues`
- `GET /api/tasks/issues/{issue_id}`
- `PATCH /api/tasks/issues/{issue_id}`
- `POST /api/tasks/issues/{issue_id}/move`
- `POST /api/tasks/issues/{issue_id}/comments`
- `POST /api/tasks/issues/{issue_id}/links`
- `POST /api/tasks/issues/{issue_id}/attachments`

Sprints:
- `GET /api/tasks/projects/{project_id}/sprints`
- `POST /api/tasks/projects/{project_id}/sprints`
- `POST /api/tasks/sprints/{sprint_id}/start`
- `POST /api/tasks/sprints/{sprint_id}/close`

Seed:
- `POST /api/tasks/seed/novendor_winston_build` (dev/local only)

Additional:
- `GET /api/tasks/projects/key/{project_key}`
- `GET /api/tasks/projects/{project_id}/analytics`
- `POST /api/tasks/issues/{issue_id}/context-links`
- `GET /api/metrics` (task datapoints)

## Frontend Routes
- `/tasks` project list + create + seed CTA
- `/tasks/[projectKey]` tabbed project surface
- `/tasks/[projectKey]/analytics` analytics route alias

Tabs in project view:
1. Board
2. Backlog
3. Sprints
4. Issues
5. Analytics

## Keyboard Shortcuts
- `N` open New Issue dialog
- `/` focus search
- `Esc` close drawer/dialog

## Stable Test IDs
- `tasks-project-list`
- `tasks-open-project-{key}`
- `tasks-board`
- `tasks-column-{statusKey}`
- `issue-card-{issueKey}`
- `new-issue`
- `issue-drawer`
- `backlog-list`
- `sprint-create`
- `filter-search`

## AI Assist (Local-only)
AI helper buttons in New Issue and Issue Drawer call local Winston AI routes:
- `/api/ai/health`
- `/api/ai/ask`

Behavior:
- Graceful fallback when unavailable
- Suggestions are never auto-applied; user confirms before insertion

## Testing
Backend:
- `backend/tests/test_tasks_service.py`
- `backend/tests/test_tasks_migration.py`

Frontend:
- `repo-b/tests/tasks.spec.ts`

Run:
- Backend: `cd backend && ./.venv/bin/python -m pytest -q tests/test_tasks_service.py tests/test_tasks_migration.py`
- Frontend e2e: `cd repo-b && npm run test:e2e -- tests/tasks.spec.ts`
