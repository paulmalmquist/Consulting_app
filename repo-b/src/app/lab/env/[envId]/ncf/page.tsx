import NCFLandingMockup from "@/components/ncf/NCFLandingMockup";

export default async function NCFHomePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <NCFLandingMockup envId={envId} />;
}
