import { EccBriefClient } from "@/components/ecc/EccClient";

export default async function EccBriefPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <EccBriefClient envId={envId} />;
}
