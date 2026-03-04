"use client";

import { useEffect, useMemo, useState } from "react";
import {
  actOnPdsExecutiveQueueItem,
  approvePdsExecutiveDraft,
  generatePdsExecutiveBriefing,
  generatePdsExecutiveMessaging,
  getPdsExecutiveMemory,
  getPdsExecutiveOverview,
  listPdsExecutiveDrafts,
  listPdsExecutiveQueue,
  runPdsExecutiveConnectors,
  runPdsExecutiveFull,
} from "@/lib/bos-api";
import type {
  PdsExecutiveBriefingPack,
  PdsExecutiveNarrativeDraft,
  PdsExecutiveOverview,
  PdsExecutiveQueueItem,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import ExecutiveOverview from "@/components/pds-executive/ExecutiveOverview";
import DecisionQueue from "@/components/pds-executive/DecisionQueue";
import DecisionDetailDrawer from "@/components/pds-executive/DecisionDetailDrawer";
import StrategicMessagingTab from "@/components/pds-executive/StrategicMessagingTab";
import BoardInvestorBriefingsTab from "@/components/pds-executive/BoardInvestorBriefingsTab";
import DecisionMemoryTab from "@/components/pds-executive/DecisionMemoryTab";

type TabKey = "queue" | "messaging" | "briefings" | "memory";

export default function PdsExecutivePage() {
  const { envId, businessId } = useDomainEnv();

  const [overview, setOverview] = useState<PdsExecutiveOverview | null>(null);
  const [queue, setQueue] = useState<PdsExecutiveQueueItem[]>([]);
  const [drafts, setDrafts] = useState<PdsExecutiveNarrativeDraft[]>([]);
  const [briefings, setBriefings] = useState<PdsExecutiveBriefingPack[]>([]);
  const [memoryItems, setMemoryItems] = useState<Array<Record<string, unknown>>>([]);

  const [selectedItem, setSelectedItem] = useState<PdsExecutiveQueueItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("queue");

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actor = "pds_exec_user";

  async function loadOverview() {
    const data = await getPdsExecutiveOverview(envId, businessId || undefined);
    setOverview(data);
  }

  async function loadQueue() {
    const data = await listPdsExecutiveQueue(envId, businessId || undefined, { limit: 100 });
    setQueue(data);
  }

  async function loadDrafts() {
    const data = await listPdsExecutiveDrafts(envId, businessId || undefined, { limit: 100 });
    setDrafts(data);
  }

  async function loadMemory() {
    const data = await getPdsExecutiveMemory(envId, businessId || undefined, 100);
    setMemoryItems(data.items || []);
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadOverview(), loadQueue(), loadDrafts(), loadMemory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executive workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function handleRunConnectors() {
    setRunning(true);
    setError(null);
    try {
      await runPdsExecutiveConnectors({
        env_id: envId,
        business_id: businessId || undefined,
        actor,
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run connectors");
    } finally {
      setRunning(false);
    }
  }

  async function handleRunFull() {
    setRunning(true);
    setError(null);
    try {
      await runPdsExecutiveFull({
        env_id: envId,
        business_id: businessId || undefined,
        actor,
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run full cycle");
    } finally {
      setRunning(false);
    }
  }

  async function handleQueueAction(item: PdsExecutiveQueueItem, action: "approve" | "delegate" | "escalate" | "defer" | "reject") {
    setError(null);
    try {
      await actOnPdsExecutiveQueueItem(
        item.queue_item_id,
        {
          action_type: action,
          actor,
          rationale: "Actioned from Executive queue",
        },
        envId,
        businessId || undefined,
      );
      await Promise.all([loadOverview(), loadQueue(), loadMemory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed queue action");
    }
  }

  async function handleDrawerAction(
    item: PdsExecutiveQueueItem,
    action: "approve" | "delegate" | "escalate" | "defer" | "reject",
    rationale: string,
  ) {
    setError(null);
    try {
      await actOnPdsExecutiveQueueItem(
        item.queue_item_id,
        {
          action_type: action,
          actor,
          rationale,
        },
        envId,
        businessId || undefined,
      );
      setSelectedItem(null);
      await Promise.all([loadOverview(), loadQueue(), loadMemory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed queue action");
    }
  }

  async function handleGenerateMessaging() {
    setGenerating(true);
    setError(null);
    try {
      await generatePdsExecutiveMessaging({
        env_id: envId,
        business_id: businessId || undefined,
        actor,
        draft_types: ["earnings_call", "press_release", "internal_memo", "conference_talking_points"],
      });
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate messaging");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApproveDraft(draft: PdsExecutiveNarrativeDraft) {
    setError(null);
    try {
      await approvePdsExecutiveDraft(draft.draft_id, {
        env_id: envId,
        business_id: businessId || undefined,
        actor,
      });
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve draft");
    }
  }

  async function handleGenerateBriefing(briefingType: "board" | "investor") {
    setGenerating(true);
    setError(null);
    try {
      const pack = await generatePdsExecutiveBriefing({
        env_id: envId,
        business_id: businessId || undefined,
        briefing_type: briefingType,
        actor,
      });
      setBriefings((prev) => [pack, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate briefing");
    } finally {
      setGenerating(false);
    }
  }

  const tabs = useMemo(
    () => [
      { key: "queue" as const, label: `Queue (${queue.length})` },
      { key: "messaging" as const, label: "Strategic Messaging" },
      { key: "briefings" as const, label: "Board / Investor" },
      { key: "memory" as const, label: `Decision Memory (${memoryItems.length})` },
    ],
    [queue.length, memoryItems.length],
  );

  return (
    <div className="space-y-4" data-testid="pds-executive-page">
      <ExecutiveOverview
        overview={overview}
        loading={loading}
        running={running}
        onRunConnectors={handleRunConnectors}
        onRunFull={handleRunFull}
      />

      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                activeTab === tab.key
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100" data-testid="pds-executive-error">
          {error}
        </div>
      ) : null}

      {activeTab === "queue" ? (
        <DecisionQueue
          items={queue}
          loading={loading}
          onSelect={setSelectedItem}
          onAction={handleQueueAction}
        />
      ) : null}

      {activeTab === "messaging" ? (
        <StrategicMessagingTab
          drafts={drafts}
          loading={loading}
          generating={generating}
          onGenerate={handleGenerateMessaging}
          onApprove={handleApproveDraft}
        />
      ) : null}

      {activeTab === "briefings" ? (
        <BoardInvestorBriefingsTab
          briefings={briefings}
          loading={loading}
          generating={generating}
          onGenerate={handleGenerateBriefing}
        />
      ) : null}

      {activeTab === "memory" ? (
        <DecisionMemoryTab items={memoryItems} loading={loading} />
      ) : null}

      <DecisionDetailDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAction={handleDrawerAction}
      />
    </div>
  );
}
