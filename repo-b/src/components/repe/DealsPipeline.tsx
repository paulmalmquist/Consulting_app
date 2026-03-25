import React from "react";

export interface DealBucket {
  stage: string;
  count: number;
}

interface DealsPipelineProps {
  buckets: DealBucket[];
}

export function DealsPipeline({ buckets }: DealsPipelineProps) {
  return (
    <section data-testid="deals-pipeline">
      {buckets.map((bucket) => (
        <div key={bucket.stage} data-testid="deal-stage">
          <p>{bucket.stage}</p>
          <p data-testid={`deal-count-${bucket.stage}`}>{bucket.count}</p>
        </div>
      ))}
    </section>
  );
}
