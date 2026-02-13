"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { VerificationResult } from "@/lib/commandbar/types";

export default function VerificationCard({
  items,
}: {
  items: VerificationResult[];
}) {
  if (!items.length) return null;

  return (
    <Card className="border border-bm-border/70 bg-bm-surface/35">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Verification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((item) => (
          <div
            key={`${item.stepId}_${item.summary}`}
            className="rounded-lg border border-bm-border/70 bg-bm-surface/25 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-bm-text">{item.summary}</p>
              <Badge variant={item.ok ? "success" : "danger"}>{item.ok ? "OK" : "Failed"}</Badge>
            </div>
            {item.links?.length ? (
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {item.links.map((link) => (
                  <a
                    key={`${item.stepId}_${link.href}`}
                    className="text-bm-accent hover:underline"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
