"use client";

import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";

const CONTENT_TYPES = [
  {
    type: "Case Studies",
    description: "Published case studies demonstrating results and methodologies",
    count: 0,
  },
  {
    type: "LinkedIn Posts",
    description: "Thought leadership posts for social proof and lead generation",
    count: 0,
  },
  {
    type: "Whitepapers",
    description: "Deep-dive research documents for authority building",
    count: 0,
  },
  {
    type: "Lead Magnets",
    description: "Downloadable resources for lead capture",
    count: 0,
  },
];

export default function AuthorityPage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useConsultingEnv();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Authority Engine
        </h2>
        <p className="text-sm text-bm-muted mb-4">
          Build thought leadership, publish case studies, and track lead attribution from content.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {CONTENT_TYPES.map((ct) => (
          <Card key={ct.type}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">{ct.type}</h3>
                <span className="text-xs text-bm-muted2">{ct.count} published</span>
              </div>
              <p className="text-xs text-bm-muted">{ct.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-bm-muted2">
            Content pipeline coming soon. This module will repurpose consulting engagement
            results into case studies, LinkedIn posts, and lead magnets with attribution tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
