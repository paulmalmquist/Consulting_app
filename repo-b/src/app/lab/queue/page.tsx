"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type QueueItem = {
  id: string;
  created_at: string;
  status: string;
  risk_level: string;
  requested_action: Record<string, unknown>;
};

export default function QueuePage() {
  const { selectedEnv } = useEnv();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadQueue = async () => {
    if (!selectedEnv) return;
    try {
      const data = await apiFetch<{ items: QueueItem[] }>("/v1/queue", {
        params: { env_id: selectedEnv.env_id }
      });
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [selectedEnv?.env_id]);

  const decide = async (id: string, decision: "approve" | "deny") => {
    setMessage(null);
    try {
      await apiFetch(`/v1/queue/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: "Reviewed in demo" })
      });
      setMessage(`Decision recorded (${decision}).`);
      await loadQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Decision failed";
      setMessage(message);
    }
  };

  return (
    <EnvGate>
      <div className="space-y-6">
        <Card>
          <CardContent>
            <CardTitle className="text-xl">HITL Queue</CardTitle>
            <CardDescription>
              Demo Approver reviews medium/high risk actions.
            </CardDescription>
            {message ? <p className="mt-3 text-sm text-bm-success">{message}</p> : null}
          </CardContent>
        </Card>
        <section className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">
                      {typeof item.requested_action.type === "string"
                        ? item.requested_action.type
                        : "Requested action"}
                    </p>
                    <p className="text-xs text-bm-muted2">
                      {item.risk_level} risk · {item.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(item.id, "approve")}
                      className="bg-bm-success text-bm-accentContrast hover:bg-bm-success/90"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => decide(item.id, "deny")}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
                <pre className="mt-4 text-xs text-bm-muted bg-bm-bg/20 p-3 rounded-lg overflow-auto border border-bm-border/60">
{JSON.stringify(item.requested_action, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 ? (
            <p className="text-sm text-bm-muted2">No pending approvals.</p>
          ) : null}
        </section>
      </div>
    </EnvGate>
  );
}
