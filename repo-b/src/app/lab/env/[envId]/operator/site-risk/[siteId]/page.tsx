import { SiteRiskDetailPage } from "@/components/operator/SiteRiskPages";

export default async function OperatorSiteDetailRoute({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <SiteRiskDetailPage siteId={siteId} />;
}
