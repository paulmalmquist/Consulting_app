import { redirect } from "next/navigation";

export default async function LegacyPdsExecutivePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/pds/ai-briefing`);
}
