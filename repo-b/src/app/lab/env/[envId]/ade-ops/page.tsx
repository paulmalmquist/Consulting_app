import AdeOpsConsole from "@/components/ade-ops/AdeOpsConsole";

export default async function AdeOpsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <AdeOpsConsole envId={envId} />;
}
