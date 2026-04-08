import { redirect } from "next/navigation";

export default function ConsultingPage({ params }: { params: { envId: string } }) {
  redirect(`/lab/env/${params.envId}/consulting/pipeline`);
}
