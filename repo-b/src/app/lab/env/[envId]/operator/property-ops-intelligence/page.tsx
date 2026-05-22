import { HappyCoDemoClient } from "@/components/happyco/HappyCoDemoClient";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function OperatorPropertyOpsIntelligenceRoute({ params }: Props) {
  const { envId } = await params;
  return <HappyCoDemoClient envId={envId} />;
}
