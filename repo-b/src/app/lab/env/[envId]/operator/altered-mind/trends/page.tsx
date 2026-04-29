import { redirect } from "next/navigation";

export default async function AlteredMindOperatorTrendsRedirect({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/altered-mind/trends`);
}
