import { EccQueueClient } from "@/components/ecc/EccClient";

export default async function EccPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <EccQueueClient envId={envId} />;
}
