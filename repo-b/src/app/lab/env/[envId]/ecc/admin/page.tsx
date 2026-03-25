import { EccAdminClient } from "@/components/ecc/EccClient";

export default async function EccAdminPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <EccAdminClient envId={envId} />;
}
