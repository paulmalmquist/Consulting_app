"use client";

import type { CloudConfig } from "@/lib/historyrhymes/mlDemo";
import { Tag } from "./mlUi";

export function CloudProviderBadge({ config }: { config: CloudConfig | null }) {
  if (!config) return <Tag tone="neutral">Cloud detail mode: Local demo only</Tag>;
  const tone = config.provider === "gcp" ? "sky" : config.provider === "databricks" ? "violet" : "neutral";
  return (
    <span className="inline-flex items-center gap-2" data-testid="hr-ml-cloud-badge">
      <Tag tone={tone}>{config.label}</Tag>
      {!config.configured && config.provider !== "none" ? (
        <span className="text-[10px] text-amber-300">links config-ready</span>
      ) : null}
    </span>
  );
}
