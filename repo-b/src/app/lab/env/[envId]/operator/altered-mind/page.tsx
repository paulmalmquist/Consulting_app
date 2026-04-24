import { AlteredMindDashboard } from "@/components/altered-mind/AlteredMindDashboard";

export default async function AlteredMindPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <AlteredMindDashboard envId={envId} />;
}
