import { redirect } from "next/navigation";

export default function ConsultingExecutionRedirect({ params }: { params: { envId: string } }) {
  redirect(`/lab/env/${params.envId}/consulting/tasks`);
}
