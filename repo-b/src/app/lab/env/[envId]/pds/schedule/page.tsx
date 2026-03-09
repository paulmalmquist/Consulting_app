import { redirect } from "next/navigation";

export default async function LegacyPdsSchedulePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/pds/risk`);
}
