import { redirect } from "next/navigation";

export default async function AdeConnectorsRedirect({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/telemetry/data-engineering/sources`);
}
