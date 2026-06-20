import { MLAlgorithmLabClient } from "@/components/historyrhymes/MLAlgorithmLabClient";

export default async function MLAlgorithmsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <MLAlgorithmLabClient envId={envId} />;
}
