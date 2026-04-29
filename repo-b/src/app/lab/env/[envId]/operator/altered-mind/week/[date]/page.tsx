import { redirect } from "next/navigation";

export default async function AlteredMindOperatorWeekRedirect({
  params,
}: {
  params: Promise<{ envId: string; date: string }>;
}) {
  const { envId, date } = await params;
  redirect(`/lab/env/${envId}/altered-mind/week/${date}`);
}
