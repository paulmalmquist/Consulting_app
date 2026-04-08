import { OperatorProjectDetailPage } from "@/components/operator/OperatorPages";

export default async function OperatorProjectDetailRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <OperatorProjectDetailPage projectId={projectId} />;
}
