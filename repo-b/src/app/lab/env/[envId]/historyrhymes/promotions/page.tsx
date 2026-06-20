import { PromotionReviewClient } from "@/components/historyrhymes/promotions/PromotionReviewClient";

export default async function PromotionsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <PromotionReviewClient envId={envId} />;
}
