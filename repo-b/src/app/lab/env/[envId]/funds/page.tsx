import { redirect } from "next/navigation";

export default async function LegacyFundsRedirect({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/re/funds`);
}
