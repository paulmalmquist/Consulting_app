"use client";

import React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoopForm, { type LoopFormSubmitPayload } from "@/components/consulting/LoopForm";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { createLoop, fetchClients, type Client } from "@/lib/cro-api";

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Unable to create loop.";
  }
  return err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "") || "Unable to create loop.";
}

export default function NewConsultingLoopPage({
  params,
}: {
  params: { envId: string };
}) {
  const router = useRouter();
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!businessId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    fetchClients(params.envId, businessId)
      .then((rows) => {
        if (active) {
          setClients(rows);
        }
      })
      .catch((err) => {
        if (active) {
          setError(formatError(err));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [businessId, params.envId, ready]);

  async function handleSubmit(payload: LoopFormSubmitPayload) {
    if (!businessId) {
      setError("Environment is not bound to a business.");
      return;
    }

    setError(null);
    const loop = await createLoop({
      env_id: params.envId,
      business_id: businessId,
      ...payload,
    });
    router.push(`/lab/env/${params.envId}/consulting/loops/${loop.id}`);
  }

  if (contextLoading || (ready && loading)) {
    return <div className="h-80 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />;
  }

  const bannerMessage = contextError || error;

  if (!businessId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-bm-muted2">
          This environment is not bound to a business, so loops cannot be created.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      <div>
        <CardTitle>New Loop</CardTitle>
        <p className="text-sm text-bm-muted mt-2">
          Add a recurring workflow, its operator effort, and the current control state.
        </p>
      </div>

      <LoopForm clients={clients} onSubmit={handleSubmit} submitLabel="Create Loop" />
    </div>
  );
}
