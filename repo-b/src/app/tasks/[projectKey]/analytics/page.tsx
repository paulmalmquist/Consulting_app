import TasksProjectClient from "@/components/tasks/TasksProjectClient";

export default function TaskProjectAnalyticsPage({
  params,
}: {
  params: { projectKey: string };
}) {
  return <TasksProjectClient projectKey={params.projectKey} initialTab="analytics" />;
}
