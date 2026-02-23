"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type ContentItem = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  area: string | null;
  state: "idea" | "draft" | "review" | "scheduled" | "published";
  target_keyword: string | null;
  monetization_type: string;
  created_at: string;
};

type ContentStats = {
  idea: number;
  draft: number;
  review: number;
  scheduled: number;
  published: number;
  total: number;
};

const STATES: ContentItem["state"][] = ["idea", "draft", "review", "scheduled", "published"];

const STATE_NEXT: Record<ContentItem["state"], ContentItem["state"] | null> = {
  idea: "draft",
  draft: "review",
  review: "scheduled",
  scheduled: "published",
  published: null,
};

const STATE_LABEL: Record<ContentItem["state"], string> = {
  idea: "Idea",
  draft: "Draft",
  review: "Review",
  scheduled: "Scheduled",
  published: "Published",
};

const STATE_COLOR: Record<ContentItem["state"], string> = {
  idea: "bg-bm-surface/60 border-bm-border/70",
  draft: "bg-blue-500/10 border-blue-500/30",
  review: "bg-amber-500/10 border-amber-500/30",
  scheduled: "bg-purple-500/10 border-purple-500/30",
  published: "bg-green-500/10 border-green-500/30",
};

const MONETIZATION_LABEL: Record<string, string> = {
  affiliate: "Affiliate",
  sponsor: "Sponsor",
  lead_gen: "Lead Gen",
  none: "",
};

export default function ContentPage() {
  const params = useParams<{ envId: string }>();
  const envId = params.envId;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [stats, setStats] = useState<ContentStats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [state, setState] = useState<ContentItem["state"]>("idea");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [itemsData, statsData] = await Promise.all([
      apiFetch<ContentItem[]>(`/api/website/content/items?env_id=${envId}`),
      apiFetch<ContentStats>(`/api/website/content/stats?env_id=${envId}`),
    ]);
    setItems(itemsData);
    setStats(statsData);
  }, [envId]);

  useEffect(() => {
    refresh().catch(() => null);
  }, [refresh]);

  async function onCreateItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      await apiFetch("/api/website/content/items", {
        method: "POST",
        body: JSON.stringify({
          env_id: envId,
          title,
          slug,
          category: category || null,
          area: area || null,
          target_keyword: targetKeyword || null,
          state,
          monetization_type: "none",
        }),
      });
      setTitle("");
      setCategory("");
      setArea("");
      setState("idea");
      setTargetKeyword("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create content item");
    }
  }

  async function advanceState(item: ContentItem) {
    const next = STATE_NEXT[item.state];
    if (!next) return;
    setStatus(`Moving "${item.title}" to ${STATE_LABEL[next]}…`);
    try {
      await apiFetch(`/api/website/content/items/${item.id}/state`, {
        method: "PATCH",
        body: JSON.stringify({ env_id: envId, state: next }),
      });
      await refresh();
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update state");
      setStatus("");
    }
  }

  const byState = STATES.reduce((acc, s) => {
    acc[s] = items.filter((i) => i.state === s);
    return acc;
  }, {} as Record<ContentItem["state"], ContentItem[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Content</p>
          <h1 className="text-2xl font-bold">Editorial Pipeline</h1>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New Content"}
        </Button>
      </div>

      {/* Stats bar */}
      {stats ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-bm-muted">{stats.total} total</span>
          {STATES.map((s) => (
            stats[s] > 0 ? (
              <span key={s} className="text-bm-muted">
                <span className="font-medium text-bm-text">{stats[s]}</span> {STATE_LABEL[s].toLowerCase()}
              </span>
            ) : null
          ))}
        </div>
      ) : null}

      {/* New content form */}
      {showForm ? (
        <Card>
          <CardContent className="py-4">
            <form onSubmit={onCreateItem} className="space-y-3">
              <h2 className="font-semibold">New Content Item</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-bm-muted">Title</label>
                  <Input
                    className="mt-1"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Best Bagels in Palm Beach"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Category</label>
                  <Input
                    className="mt-1"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Rankings"
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Area</label>
                  <Input
                    className="mt-1"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="Palm Beach County"
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">State</label>
                  <select
                    className="mt-1 w-full rounded-md border border-bm-border/70 bg-bm-surface/60 px-3 py-2 text-sm text-bm-text"
                    value={state}
                    onChange={(e) => setState(e.target.value as ContentItem["state"])}
                  >
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {STATE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Target Keyword</label>
                  <Input
                    className="mt-1"
                    value={targetKeyword}
                    onChange={(e) => setTargetKeyword(e.target.value)}
                    placeholder="best bagels palm beach county"
                  />
                </div>
              </div>
              {error ? (
                <p className="text-sm text-bm-danger">{error}</p>
              ) : null}
              <Button type="submit">Save</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {status ? (
        <p className="text-sm text-bm-muted">{status}</p>
      ) : null}

      {/* Kanban columns */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {STATES.map((state) => (
          <div key={state}>
            <h3 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2 flex items-center gap-2">
              {STATE_LABEL[state]}
              <span className="rounded-full bg-bm-surface px-1.5 py-0.5 text-bm-muted text-[10px]">
                {byState[state].length}
              </span>
            </h3>
            <div className="space-y-2">
              {byState[state].map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 text-sm ${STATE_COLOR[state]}`}
                >
                  <p className="font-medium text-bm-text leading-snug">{item.title}</p>
                  {item.category ? (
                    <p className="text-xs text-bm-muted mt-0.5">{item.category}</p>
                  ) : null}
                  {item.area ? (
                    <p className="text-xs text-bm-muted2 mt-0.5">{item.area}</p>
                  ) : null}
                  {item.target_keyword ? (
                    <p className="text-xs text-bm-muted2 mt-1 truncate">{item.target_keyword}</p>
                  ) : null}
                  {item.monetization_type !== "none" ? (
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-bm-accent/15 text-bm-accent">
                      {MONETIZATION_LABEL[item.monetization_type]}
                    </span>
                  ) : null}
                  {STATE_NEXT[item.state] ? (
                    <button
                      onClick={() => advanceState(item)}
                      className="mt-2 text-xs text-bm-accent hover:underline block"
                    >
                      Move to {STATE_LABEL[STATE_NEXT[item.state]!]} →
                    </button>
                  ) : null}
                </div>
              ))}
              {byState[state].length === 0 ? (
                <p className="text-xs text-bm-muted2 py-2 text-center">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
