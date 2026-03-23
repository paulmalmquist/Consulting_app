import TasksProjectClient from "@/components/tasks/TasksProjectClient";

type Props = {
  params: { projectKey: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

const VALID_TABS = new Set(["board", "backlog", "sprints", "issues", "analytics"]);

export default function TaskProjectPage({ params, searchParams }: Props) {
  const rawTab = searchParams?.tab;
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const initialTab =
    tab && VALID_TABS.has(tab) ? (tab as "board" | "backlog" | "sprints" | "issues" | "analytics") : "board";

  return <TasksProjectClient projectKey={params.projectKey} initialTab={initialTab} />;
}
