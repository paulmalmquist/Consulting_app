"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";

import {
  actOnPdsExecutiveQueueItem,
  type PdsV2InterventionQueueItem,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { reasonLabel } from "@/components/pds-enterprise/pdsEnterprise";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-pds-signalRed/30 bg-pds-signalRed/10",
  warning: "border-pds-signalOrange/30 bg-pds-signalOrange/10",
  watch: "border-pds-signalYellow/30 bg-pds-signalYellow/10",
  neutral: "border-bm-border/60 bg-bm-surface/20",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  delegated: "Assigned",
  escalated: "Escalated",
  deferred: "Snoozed",
  closed: "Resolved",
};

export function PdsInterventionQueue({
  items,
  activeFilterKey,
  onInterventionSelect,
}: {
  items: PdsV2InterventionQueueItem[];
  activeFilterKey?: string | null;
  onInterventionSelect?: (item: PdsV2InterventionQueueItem) => void;
}) {
  const { envId, businessId } = useDomainEnv();
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);

  React.useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const visibleItems = useMemo(
    () => localItems.filter((item) => item.queue_status !== "closed"),
    [localItems],
  );

  async function handleAction(item: PdsV2InterventionQueueItem, action: "delegate" | "escalate" | "defer" | "close") {
    if (!item.queue_item_id) return;
    setPendingId(item.intervention_id);
    try {
      await actOnPdsExecutiveQueueItem(
        item.queue_item_id,
        {
          action_type: action,
          actor: "stone_home",
          delegate_to: action === "delegate" ? item.owner_label || "Operations lead" : undefined,
          rationale: `Homepage intervention action: ${action}`,
        },
        envId,
        businessId || undefined,
      );
      setLocalItems((current) =>
        current.map((currentItem) =>
          currentItem.intervention_id === item.intervention_id
            ? {
                ...currentItem,
                queue_status:
                  action === "delegate" ? "delegated" : action === "defer" ? "deferred" : action === "close" ? "closed" : "escalated",
              }
            : currentItem,
        ),
      );
    } finally {
      setPendingId(null);
    }
  }

  if (!visibleItems.length) return null;

  return (
    <section className="rounded-[24px] border border-bm-border/70 bg-bm-surface/20 p-5" data-testid="pds-intervention-queue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Intervention Queue</p>
          <h3 className="mt-1 text-xl font-semibold text-bm-text">Ranked issues, quantified impact, and the next move</h3>
        </div>
        <div className="text-xs text-bm-muted2">
          {visibleItems.length} active interventions
          {activeFilterKey ? ` · filtered by ${activeFilterKey.replace(/_/g, " ")}` : ""}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {visibleItems.map((item) => (
          <article
            key={item.intervention_id}
            className={`rounded-[22px] border p-4 ${SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.neutral}`}
          >
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => onInterventionSelect?.(item)} className="text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">{item.entity_type.replace(/_/g, " ")}</p>
                <h4 className="mt-1 text-lg font-semibold text-bm-text">{item.entity_label}</h4>
              </button>
              <span className="rounded-full border border-bm-border/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                {STATUS_LABELS[item.queue_status || "open"] || "Open"}
              </span>
            </div>

            <p className="mt-3 text-sm text-bm-text">{item.issue_summary}</p>
            <p className="mt-2 text-sm text-bm-muted2">{item.cause_summary}</p>
            {item.expected_impact ? <p className="mt-2 text-sm text-pds-signalRed/90">{item.expected_impact}</p> : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.reason_codes.map((reason) => (
                <span key={reason} className="rounded-full border border-bm-border/60 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                  {reasonLabel(reason)}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-bm-border/60 bg-bm-surface/15 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">Recommended action</p>
              <p className="mt-1 text-sm font-medium text-bm-text">{item.recommended_action}</p>
              {item.owner_label ? <p className="mt-1 text-xs text-bm-muted2">Owner: {item.owner_label}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendingId === item.intervention_id}
                onClick={() => handleAction(item, "delegate")}
                className="rounded-full border border-bm-border/60 px-3 py-1.5 text-xs text-bm-text transition hover:bg-bm-surface/25 disabled:opacity-50"
              >
                Assign
              </button>
              <button
                type="button"
                disabled={pendingId === item.intervention_id}
                onClick={() => handleAction(item, "escalate")}
                className="rounded-full border border-bm-border/60 px-3 py-1.5 text-xs text-bm-text transition hover:bg-bm-surface/25 disabled:opacity-50"
              >
                Escalate
              </button>
              <button
                type="button"
                disabled={pendingId === item.intervention_id}
                onClick={() => handleAction(item, "defer")}
                className="rounded-full border border-bm-border/60 px-3 py-1.5 text-xs text-bm-text transition hover:bg-bm-surface/25 disabled:opacity-50"
              >
                Snooze
              </button>
              <button
                type="button"
                disabled={pendingId === item.intervention_id}
                onClick={() => handleAction(item, "close")}
                className="rounded-full border border-bm-border/60 px-3 py-1.5 text-xs text-bm-text transition hover:bg-bm-surface/25 disabled:opacity-50"
              >
                Resolve
              </button>
              {item.href ? (
                <Link href={item.href} className="rounded-full border border-pds-accent/30 px-3 py-1.5 text-xs text-pds-accentText transition hover:bg-pds-accent/10">
                  Open project
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
