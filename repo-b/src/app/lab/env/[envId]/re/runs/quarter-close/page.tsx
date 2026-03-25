import { redirect } from "next/navigation";

export default function LegacyRunCenterRedirect({
  params,
  searchParams,
}: {
  params: { envId: string };
  searchParams?: { fundId?: string };
}) {
  const next = new URLSearchParams();
  if (searchParams?.fundId) next.set("fundId", searchParams.fundId);
  const query = next.toString();
  redirect(`/lab/env/${params.envId}/re/waterfalls${query ? `?${query}` : ""}`);
}
