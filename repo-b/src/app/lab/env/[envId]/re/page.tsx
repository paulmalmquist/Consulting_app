import RepeWorkspace from "@/components/repe/RepeWorkspace";
import { getRepeWorkspace } from "@/lib/server/repe";

export const dynamic = "force-dynamic";

export default async function RepeWorkspacePage({
  params,
  searchParams,
}: {
  params: { envId: string };
  searchParams?: { fund_id?: string; quarter?: string };
}) {
  const workspace = await getRepeWorkspace({
    envId: params.envId,
    fundId: searchParams?.fund_id,
    quarter: searchParams?.quarter,
  });

  return <RepeWorkspace envId={params.envId} initialData={workspace} />;
}
