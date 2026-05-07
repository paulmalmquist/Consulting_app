import { AiUsageDashboard } from "@/components/ai-usage/AiUsageDashboard";

interface Props {
  params: Promise<{ envId: string }>;
}

/**
 * AI Usage Attribution dashboard.
 * Lives at /lab/env/[envId]/ai-usage.
 *
 * Surfaces:
 *  - 30-day spend summary (total, by model, by source, by business unit)
 *  - Per-day spend timeline
 *  - Per-skill cost breakdown
 *  - Open recommendations from the rules engine, sorted by est. savings
 *
 * Backed by /api/ai-usage/v1/* (see backend/app/routes/ai_usage.py).
 */
export default async function AiUsagePage({ params }: Props) {
  const { envId } = await params;
  return (
    <div className="p-6">
      <AiUsageDashboard envId={envId} />
    </div>
  );
}
