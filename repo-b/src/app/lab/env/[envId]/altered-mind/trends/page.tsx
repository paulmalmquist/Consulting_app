import { AlteredMindTrends } from "@/components/altered-mind/AlteredMindTrends";

export default async function AlteredMindTrendsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <AlteredMindTrends envId={envId} />;
}
