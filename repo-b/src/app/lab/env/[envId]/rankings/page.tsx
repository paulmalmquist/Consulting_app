"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Entity = {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  last_verified_at: string | null;
};

type RankingList = {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  entry_count: number;
};

type RankingEntry = {
  id: string;
  rank: number;
  score: number | null;
  notes: string | null;
  entity_id: string | null;
  entity_name: string | null;
  entity_category: string | null;
};

type RankingListDetail = RankingList & { entries: RankingEntry[] };

type Badge = {
  id: string;
  entity_id: string;
  entity_name: string;
  entity_category: string | null;
  badge_type: "area_champ" | "p4p_champ";
  awarded_at: string;
};

type RankingChange = {
  id: string;
  old_rank: number | null;
  new_rank: number;
  changed_by: string;
  changed_at: string;
  entity_name: string | null;
  list_name: string | null;
};

type Tab = "lists" | "entities" | "badges" | "audit";

const BADGE_LABEL: Record<string, string> = {
  area_champ: "Area Champion",
  p4p_champ: "P4P Champion",
};

export default function RankingsPage() {
  const params = useParams<{ envId: string }>();
  const envId = params.envId;

  const [tab, setTab] = useState<Tab>("lists");
  const [lists, setLists] = useState<RankingList[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [changes, setChanges] = useState<RankingChange[]>([]);
  const [expandedList, setExpandedList] = useState<RankingListDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create list form state
  const [newListName, setNewListName] = useState("");
  const [newListCategory, setNewListCategory] = useState("");
  const [newListArea, setNewListArea] = useState("");
  const [showListForm, setShowListForm] = useState(false);

  // Create entity form state
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityCategory, setNewEntityCategory] = useState("");
  const [newEntityLocation, setNewEntityLocation] = useState("");
  const [showEntityForm, setShowEntityForm] = useState(false);

  const refreshLists = useCallback(async () => {
    const data = await apiFetch<RankingList[]>(`/api/website/rankings/lists?env_id=${envId}`);
    setLists(data);
  }, [envId]);

  const refreshEntities = useCallback(async () => {
    const data = await apiFetch<Entity[]>(`/api/website/rankings/entities?env_id=${envId}`);
    setEntities(data);
  }, [envId]);

  const refreshBadges = useCallback(async () => {
    const data = await apiFetch<Badge[]>(`/api/website/rankings/badges?env_id=${envId}`);
    setBadges(data);
  }, [envId]);

  const refreshChanges = useCallback(async () => {
    const data = await apiFetch<RankingChange[]>(`/api/website/rankings/changes?env_id=${envId}`);
    setChanges(data);
  }, [envId]);

  useEffect(() => {
    refreshLists().catch(() => null);
    refreshEntities().catch(() => null);
    refreshBadges().catch(() => null);
    refreshChanges().catch(() => null);
  }, [refreshBadges, refreshChanges, refreshEntities, refreshLists]);

  async function expandList(list: RankingList) {
    if (expandedList?.id === list.id) {
      setExpandedList(null);
      return;
    }
    try {
      const detail = await apiFetch<RankingListDetail>(
        `/api/website/rankings/lists/${list.id}?env_id=${envId}`
      );
      setExpandedList(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load list");
    }
  }

  async function onCreateList(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/website/rankings/lists", {
        method: "POST",
        body: JSON.stringify({
          env_id: envId,
          name: newListName,
          category: newListCategory || null,
          area: newListArea || null,
        }),
      });
      setNewListName("");
      setNewListCategory("");
      setNewListArea("");
      setShowListForm(false);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    }
  }

  async function onCreateEntity(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/website/rankings/entities", {
        method: "POST",
        body: JSON.stringify({
          env_id: envId,
          name: newEntityName,
          category: newEntityCategory || null,
          location: newEntityLocation || null,
        }),
      });
      setNewEntityName("");
      setNewEntityCategory("");
      setNewEntityLocation("");
      setShowEntityForm(false);
      await refreshEntities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entity");
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "lists", label: "Ranking Lists" },
    { key: "entities", label: "Entities" },
    { key: "badges", label: "Champion Badges" },
    { key: "audit", label: "Audit Log" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Rankings</p>
        <h1 className="text-2xl font-bold">Rankings Manager</h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/50">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-bm-accent text-bm-text"
                : "border-transparent text-bm-muted hover:text-bm-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Ranking Lists tab */}
      {tab === "lists" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowListForm((v) => !v)}>
              {showListForm ? "Cancel" : "New List"}
            </Button>
          </div>

          {showListForm ? (
            <Card>
              <CardContent className="py-4">
                <form onSubmit={onCreateList} className="space-y-3">
                  <h3 className="font-semibold">New Ranking List</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-bm-muted">Name</label>
                      <Input
                        className="mt-1"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder="Best Bagels"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-bm-muted">Category</label>
                      <Input
                        className="mt-1"
                        value={newListCategory}
                        onChange={(e) => setNewListCategory(e.target.value)}
                        placeholder="Bagels"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-bm-muted">Area</label>
                      <Input
                        className="mt-1"
                        value={newListArea}
                        onChange={(e) => setNewListArea(e.target.value)}
                        placeholder="Palm Beach County"
                      />
                    </div>
                  </div>
                  <Button type="submit">Create List</Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-3">
            {lists.map((list) => (
              <Card key={list.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{list.name}</p>
                      <p className="text-xs text-bm-muted mt-0.5">
                        {[list.category, list.area].filter(Boolean).join(" · ")}
                        {" · "}
                        {list.entry_count} entries
                      </p>
                    </div>
                    <button
                      onClick={() => expandList(list)}
                      className="text-xs text-bm-accent hover:underline"
                    >
                      {expandedList?.id === list.id ? "Collapse" : "View entries"}
                    </button>
                  </div>

                  {expandedList?.id === list.id ? (
                    <div className="mt-4 space-y-1">
                      {expandedList.entries.length === 0 ? (
                        <p className="text-sm text-bm-muted">No entries yet.</p>
                      ) : null}
                      {expandedList.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 bg-bm-surface/40 text-sm"
                        >
                          <span className="w-6 text-center font-mono text-bm-muted2 text-xs">
                            #{entry.rank}
                          </span>
                          <span className="font-medium flex-1">
                            {entry.entity_name ?? "—"}
                          </span>
                          {entry.score != null ? (
                            <span className="text-xs text-bm-muted">{entry.score}/10</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {lists.length === 0 ? (
              <p className="text-sm text-bm-muted text-center py-4">No ranking lists yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Entities tab */}
      {tab === "entities" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowEntityForm((v) => !v)}>
              {showEntityForm ? "Cancel" : "Add Entity"}
            </Button>
          </div>

          {showEntityForm ? (
            <Card>
              <CardContent className="py-4">
                <form onSubmit={onCreateEntity} className="space-y-3">
                  <h3 className="font-semibold">Add Entity</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-bm-muted">Name</label>
                      <Input
                        className="mt-1"
                        value={newEntityName}
                        onChange={(e) => setNewEntityName(e.target.value)}
                        placeholder="Einstein Bros Bagels"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-bm-muted">Category</label>
                      <Input
                        className="mt-1"
                        value={newEntityCategory}
                        onChange={(e) => setNewEntityCategory(e.target.value)}
                        placeholder="Bagels"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-bm-muted">Location</label>
                      <Input
                        className="mt-1"
                        value={newEntityLocation}
                        onChange={(e) => setNewEntityLocation(e.target.value)}
                        placeholder="Palm Beach County"
                      />
                    </div>
                  </div>
                  <Button type="submit">Add Entity</Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 text-left">
                  <th className="pb-2 pr-4 text-xs text-bm-muted2 font-medium uppercase">Name</th>
                  <th className="pb-2 pr-4 text-xs text-bm-muted2 font-medium uppercase">Category</th>
                  <th className="pb-2 pr-4 text-xs text-bm-muted2 font-medium uppercase">Location</th>
                  <th className="pb-2 text-xs text-bm-muted2 font-medium uppercase">Last Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/30">
                {entities.map((entity) => (
                  <tr key={entity.id}>
                    <td className="py-2.5 pr-4 font-medium">{entity.name}</td>
                    <td className="py-2.5 pr-4 text-bm-muted">{entity.category ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-bm-muted">{entity.location ?? "—"}</td>
                    <td className="py-2.5 text-bm-muted2 text-xs">
                      {entity.last_verified_at
                        ? new Date(entity.last_verified_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entities.length === 0 ? (
              <p className="text-sm text-bm-muted text-center py-4">No entities yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Champion Badges tab */}
      {tab === "badges" ? (
        <div className="space-y-3">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className="flex items-center gap-4 rounded-xl border border-bm-border/70 bg-bm-surface/35 px-4 py-3"
            >
              <span className="text-xl">🏆</span>
              <div className="flex-1">
                <p className="font-semibold text-sm">{badge.entity_name}</p>
                <p className="text-xs text-bm-muted mt-0.5">
                  {BADGE_LABEL[badge.badge_type]} · {badge.entity_category ?? ""}
                </p>
              </div>
              <span className="text-xs text-bm-muted2">
                {new Date(badge.awarded_at).toLocaleDateString()}
              </span>
            </div>
          ))}
          {badges.length === 0 ? (
            <p className="text-sm text-bm-muted text-center py-4">No champion badges yet.</p>
          ) : null}
        </div>
      ) : null}

      {/* Audit Log tab */}
      {tab === "audit" ? (
        <div className="space-y-2">
          {changes.map((change) => (
            <div
              key={change.id}
              className="flex items-center gap-3 rounded-lg border border-bm-border/50 bg-bm-surface/30 px-4 py-2.5 text-sm"
            >
              <div className="flex-1">
                <span className="font-medium">{change.entity_name ?? "Unknown"}</span>
                <span className="text-bm-muted"> in </span>
                <span className="text-bm-muted">{change.list_name ?? "—"}</span>
              </div>
              <div className="text-bm-muted2 font-mono text-xs">
                {change.old_rank != null ? `#${change.old_rank} → ` : "New → "}
                #{change.new_rank}
              </div>
              <div className="text-xs text-bm-muted2">
                {new Date(change.changed_at).toLocaleDateString()}
              </div>
            </div>
          ))}
          {changes.length === 0 ? (
            <p className="text-sm text-bm-muted text-center py-4">No ranking changes recorded.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
