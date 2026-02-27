import { EccVipClient } from "@/components/ecc/EccClient";

export default async function EccVipPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <EccVipClient envId={envId} />;
}
