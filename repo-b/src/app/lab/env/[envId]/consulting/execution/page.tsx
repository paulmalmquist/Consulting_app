import { ExecutionBoard } from "@/components/consulting/execution/ExecutionBoard";

export default function ConsultingExecutionPage({ params }: { params: { envId: string } }) {
  return <ExecutionBoard envId={params.envId} />;
}
