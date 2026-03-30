"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";

interface DataProvenanceBadgeProps {
  seedPct: number;
  lastUpdated?: string | null;
  className?: string;
}

export function DataProvenanceBadge({
  seedPct,
  lastUpdated,
  className = "",
}: DataProvenanceBadgeProps) {
  const isLive = seedPct === 0;
  const isSeed = seedPct === 100;
  const isStale =
    lastUpdated &&
    Date.now() - new Date(lastUpdated).getTime() > 24 * 60 * 60 * 1000;

  const variant = isLive
    ? "success"
    : isSeed
      ? "accent"
      : isStale
        ? "warning"
        : "accent";

  const label = isLive
    ? "LIVE"
    : isSeed
      ? "SEED DATA"
      : isStale
        ? "STALE"
        : `${100 - seedPct}% LIVE`;

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
