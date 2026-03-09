import { redirect } from "next/navigation";

export default async function LegacyPdsFinancialsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/pds/revenue`);
}
