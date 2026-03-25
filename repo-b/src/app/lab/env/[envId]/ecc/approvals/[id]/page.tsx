import { EccApprovalDetailClient } from "@/components/ecc/EccClient";

export default async function EccApprovalPage({
  params,
}: {
  params: Promise<{ envId: string; id: string }>;
}) {
  const { envId, id } = await params;
  return <EccApprovalDetailClient envId={envId} payableId={id} />;
}
