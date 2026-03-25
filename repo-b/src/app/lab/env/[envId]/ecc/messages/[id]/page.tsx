import { EccMessageDetailClient } from "@/components/ecc/EccClient";

export default async function EccMessagePage({
  params,
}: {
  params: Promise<{ envId: string; id: string }>;
}) {
  const { envId, id } = await params;
  return <EccMessageDetailClient envId={envId} messageId={id} />;
}
