import { redirect } from "next/navigation";

// The standalone ADE mount is superseded by the composed telemetry Data Engineering section.
// The portable ADE package (components/lib/backend) is unchanged and still mountable elsewhere;
// only this telemetry mount redirects. See ADR 0002 follow-up.
export default async function AdeOverviewRedirect({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/telemetry/data-engineering`);
}
