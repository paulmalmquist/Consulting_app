import { PropertyOpsIntelligencePage } from "@/components/operator/property-ops/PropertyOpsIntelligencePage";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function OperatorPropertyOpsIntelligenceRoute({ params }: Props) {
  const { envId } = await params;
  return <PropertyOpsIntelligencePage envId={envId} />;
}
