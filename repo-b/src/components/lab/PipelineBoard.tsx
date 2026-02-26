"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import {
  createPipelineCard,
  createPipelineStage,
  deletePipelineCard,
  deletePipelineStage,
  getPipelineBoard,
  patchPipelineCard,
  type PipelineBoard,
  type PipelineCard,
  type PipelineStage,
} from "@/lib/pipeline-api";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

type Props = {
  envId: string;
  heading: string;
  subheading: string;
  showContext?: boolean;
};

function formatMoney(cents: number | null) {
  if (typeof cents !== "number") return "No value";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function stageTone(colorToken: string | null | undefined) {
  if (colorToken === "green") return "border-bm-success/45";
  if (colorToken === "purple") return "border-bm-accent/45";
  if (colorToken === "amber") return "border-bm-warning/45";
  if (colorToken === "blue") return "border-bm-accent2/45";
  return "border-bm-border/70";
}

function DraggableCard({
  card,
  onDelete,
}: {
  card: PipelineCard;
  onDelete: (cardId: string) => void;
}) {
  const dragId = `card:${card.card_id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-lg border border-bm-border/70 bg-bm-surface/45 p-3 cursor-grab transition hover:brightness-110",
        isDragging && "opacity-40"
      )}
      data-testid={`pipeline-card-${card.card_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-bm-text truncate">{card.title}</p>
          <p className="mt-0.5 text-xs text-bm-muted truncate">
            {card.account_name || "Unassigned account"}
          </p>
        </div>
        <button
          type="button"
          className="text-[11px] text-bm-muted hover:text-bm-danger"
          onClick={() => onDelete(card.card_id)}
        >
          Remove
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-bm-muted">
        <span>{card.owner || "No owner"}</span>
        <span>{formatMoney(card.value_cents)}</span>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  cards,
  onDeleteCard,
  onDeleteStage,
}: {
  stage: PipelineStage;
  cards: PipelineCard[];
  onDeleteCard: (cardId: string) => void;
  onDeleteStage: (stageId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `stage:${stage.stage_id}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bm-command-module p-3 min-h-[220px] border",
        stageTone(stage.color_token),
        isOver && "shadow-bm-glow border-bm-accent/50"
      )}
      data-testid={`pipeline-stage-${stage.stage_key}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{stage.stage_name}</p>
          <p className="text-lg font-semibold text-bm-muted">{cards.length}</p>
        </div>
        <button
          type="button"
          className="text-[11px] text-bm-muted hover:text-bm-danger"
          onClick={() => onDeleteStage(stage.stage_id)}
        >
          Delete
        </button>
      </div>
      <div className="space-y-2">
        {cards.map((card) => (
          <DraggableCard key={card.card_id} card={card} onDelete={onDeleteCard} />
        ))}
        {cards.length === 0 ? (
          <div className="bm-command-empty rounded-lg p-5 text-center">
            <div className="mx-auto mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-bm-border/70 text-bm-muted">
              +
            </div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Drop Deals Here</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PipelineBoard({
  envId,
  heading,
  subheading,
  showContext = true,
}: Props) {
  const { push } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("slate");
  const [newCardStageId, setNewCardStageId] = useState("");
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardAccount, setNewCardAccount] = useState("");
  const [newCardOwner, setNewCardOwner] = useState("");
  const [newCardValue, setNewCardValue] = useState("");
  const [saving, setSaving] = useState(false);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getPipelineBoard(envId);
      setBoard(payload);
      setNewCardStageId((current) => current || payload.stages[0]?.stage_id || "");
    } catch (error) {
      push({
        variant: "danger",
        title: "Failed to load pipeline",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [envId, push]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const stages = board?.stages || [];
  const cards = board?.cards || [];

  const cardsByStage = useMemo(() => {
    const map: Record<string, PipelineCard[]> = {};
    for (const stage of stages) {
      map[stage.stage_id] = [];
    }
    for (const card of cards) {
      if (!map[card.stage_id]) {
        map[card.stage_id] = [];
      }
      map[card.stage_id].push(card);
    }
    Object.values(map).forEach((list) => list.sort((a, b) => a.rank - b.rank));
    return map;
  }, [cards, stages]);

  const activeCard = useMemo(
    () => cards.find((card) => card.card_id === activeCardId) || null,
    [activeCardId, cards]
  );

  const removeCard = async (cardId: string) => {
    if (!board) return;
    const previous = board.cards;
    setBoard({ ...board, cards: board.cards.filter((card) => card.card_id !== cardId) });
    try {
      await deletePipelineCard(cardId);
    } catch (error) {
      setBoard({ ...board, cards: previous });
      push({
        variant: "danger",
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const removeStage = async (stageId: string) => {
    if (!board || board.stages.length <= 1) {
      push({
        variant: "warning",
        title: "At least one stage is required",
      });
      return;
    }
    setSaving(true);
    try {
      await deletePipelineStage(stageId);
      await loadBoard();
    } catch (error) {
      push({
        variant: "danger",
        title: "Delete stage failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!id.startsWith("card:")) return;
    setActiveCardId(id.replace("card:", ""));
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id || "");
    const overId = event.over ? String(event.over.id) : "";
    setActiveCardId(null);
    if (!board || !activeId.startsWith("card:") || !overId.startsWith("stage:")) return;

    const cardId = activeId.replace("card:", "");
    const targetStageId = overId.replace("stage:", "");
    const current = board.cards.find((card) => card.card_id === cardId);
    if (!current || current.stage_id === targetStageId) return;

    const stageCards = board.cards.filter(
      (card) => card.stage_id === targetStageId && card.card_id !== cardId
    );
    const nextRank = (stageCards.at(-1)?.rank || 0) + 10;

    const optimisticCards = board.cards.map((card) =>
      card.card_id === cardId
        ? {
            ...card,
            stage_id: targetStageId,
            rank: nextRank,
            updated_at: new Date().toISOString(),
          }
        : card
    );
    setBoard({ ...board, cards: optimisticCards });

    try {
      const updated = await patchPipelineCard(cardId, {
        stage_id: targetStageId,
        rank: nextRank,
      });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map((card) => (card.card_id === cardId ? updated : card)),
        };
      });
    } catch (error) {
      setBoard(board);
      push({
        variant: "danger",
        title: "Move failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const createStage = async () => {
    if (!board || !newStageName.trim()) return;
    setSaving(true);
    try {
      const stage = await createPipelineStage({
        env_id: envId,
        stage_name: newStageName.trim(),
        color_token: newStageColor,
      });
      const nextStages = [...board.stages, stage].sort((a, b) => a.order_index - b.order_index);
      setBoard({ ...board, stages: nextStages });
      setStageDialogOpen(false);
      setNewStageName("");
      push({ variant: "success", title: "Stage added" });
    } catch (error) {
      push({
        variant: "danger",
        title: "Create stage failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const createCard = async () => {
    if (!board || !newCardTitle.trim()) return;
    setSaving(true);
    try {
      const valueDollars = Number(newCardValue);
      const valueCents =
        Number.isFinite(valueDollars) && newCardValue.trim() !== ""
          ? Math.round(valueDollars * 100)
          : null;
      const card = await createPipelineCard({
        env_id: envId,
        stage_id: newCardStageId || undefined,
        title: newCardTitle.trim(),
        account_name: newCardAccount.trim() || null,
        owner: newCardOwner.trim() || null,
        value_cents: valueCents,
      });
      setBoard({ ...board, cards: [...board.cards, card] });
      setCardDialogOpen(false);
      setNewCardTitle("");
      setNewCardAccount("");
      setNewCardOwner("");
      setNewCardValue("");
      push({ variant: "success", title: "Deal created" });
    } catch (error) {
      push({
        variant: "danger",
        title: "Create card failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <CardTitle>Loading pipeline</CardTitle>
          <CardDescription>Retrieving stages and deals.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (!board) {
    return (
      <Card>
        <CardContent>
          <CardTitle>Pipeline unavailable</CardTitle>
          <CardDescription>Could not load the current environment pipeline.</CardDescription>
          <div className="mt-4">
            <Button onClick={() => void loadBoard()}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[1.4rem]">{heading}</CardTitle>
              <CardDescription>{subheading}</CardDescription>
              {showContext ? (
                <p className="mt-2 text-xs text-bm-muted2">
                  {board.client_name} · {board.industry_type}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStageDialogOpen(true)}>
                Add Stage
              </Button>
              <Button onClick={() => setCardDialogOpen(true)}>New Deal</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage) => (
            <StageColumn
              key={stage.stage_id}
              stage={stage}
              cards={cardsByStage[stage.stage_id] || []}
              onDeleteCard={(cardId) => void removeCard(cardId)}
              onDeleteStage={(stageId) => void removeStage(stageId)}
            />
          ))}
        </section>
        <DragOverlay>
          {activeCard ? (
            <div className="w-[260px] rounded-lg border border-bm-accent/45 bg-bm-surface/90 p-3 shadow-bm-card">
              <p className="text-sm font-semibold">{activeCard.title}</p>
              <p className="mt-1 text-xs text-bm-muted">{activeCard.account_name || "No account"}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog
        open={stageDialogOpen}
        onOpenChange={setStageDialogOpen}
        title="Add Pipeline Stage"
        description="Create a new stage in this environment pipeline."
        footer={
          <>
            <Button variant="secondary" onClick={() => setStageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createStage()} disabled={saving || !newStageName.trim()}>
              {saving ? "Saving..." : "Create Stage"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Stage name</label>
            <Input
              value={newStageName}
              onChange={(event) => setNewStageName(event.target.value)}
              placeholder="Qualification"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Color</label>
            <Select value={newStageColor} onChange={(event) => setNewStageColor(event.target.value)}>
              <option value="slate">Slate</option>
              <option value="blue">Blue</option>
              <option value="amber">Amber</option>
              <option value="purple">Purple</option>
              <option value="green">Green</option>
            </Select>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={cardDialogOpen}
        onOpenChange={setCardDialogOpen}
        title="Create Deal"
        description="Add a new deal card to the selected stage."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCardDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createCard()} disabled={saving || !newCardTitle.trim()}>
              {saving ? "Saving..." : "Create Deal"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Title</label>
            <Input value={newCardTitle} onChange={(event) => setNewCardTitle(event.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Stage</label>
            <Select value={newCardStageId} onChange={(event) => setNewCardStageId(event.target.value)}>
              {stages.map((stage) => (
                <option key={stage.stage_id} value={stage.stage_id}>
                  {stage.stage_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Account</label>
              <Input value={newCardAccount} onChange={(event) => setNewCardAccount(event.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Owner</label>
              <Input value={newCardOwner} onChange={(event) => setNewCardOwner(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Value (USD)</label>
            <Input
              value={newCardValue}
              onChange={(event) => setNewCardValue(event.target.value)}
              placeholder="12500"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
