import { MunicipalityDetailPage } from "@/components/operator/MunicipalityPages";

export default async function OperatorMunicipalityDetailRoute({
  params,
}: {
  params: Promise<{ municipalityId: string }>;
}) {
  const { municipalityId } = await params;
  return <MunicipalityDetailPage municipalityId={municipalityId} />;
}
