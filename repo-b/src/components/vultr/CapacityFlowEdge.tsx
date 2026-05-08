"use client";

import { memo } from "react";
import { getStraightPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

function CapacityFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  const weight = typeof data?.weight === "number" ? data.weight : 0;
  const maxWeight = typeof data?.maxWeight === "number" ? data.maxWeight : 1;
  const ratio = maxWeight > 0 ? weight / maxWeight : 0;

  const strokeWidth = 1 + ratio * 5;
  const opacity = 0.25 + ratio * 0.55;

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke="rgb(120 113 108)"
      strokeWidth={strokeWidth}
      strokeOpacity={opacity}
    />
  );
}

export default memo(CapacityFlowEdge);
