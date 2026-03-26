"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Archive,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Compass,
  History,
  MessageSquarePlus,
  PanelRightClose,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import type { CommandMessage } from "@/lib/commandbar/store";
import { useWinstonCompanion, companionLauncherOffsetClass } from "@/components/winston-companion/WinstonCompanionProvider";
import WinstonAvatar from "@/components/winston-companion/WinstonAvatar";
import ResponseBlockRenderer from "@/components/copilot/ResponseBlockRenderer";

function formatConversationTime(value: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function hasMarkdownBlock(blocks: AssistantResponseBlock[] | null | undefined) {
  return Boolean(blocks?.some((block) => block.type === "markdown_text"));
}

function laneLabel(lane: "contextual" | "general") {
  return lane === "contextual" ? "Contextual" : "General";
}

function ThreadViewport({
  messages,
  thinking,
  thinkingStatus,
  compact = false,
}: {
  messages: CommandMessage[];
  thinking: boolean;
  thinkingStatus?: string;
  compact?: boolean;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, thinkingStatus]);

  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-4 py-4" : "px-6 py-6")}
      data-testid="global-commandbar-output"
    >
      <div className={cn("mx-auto flex w-full flex-col gap-5", compact ? "max-w-none" : "max-w-5xl")}>
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <article
              key={message.id}
              className={cn(
                "rounded-[28px] border px-4 py-4",
                isUser
                  ? "ml-auto max-w-3xl border-bm-accent/20 bg-bm-accent/10"
                  : "max-w-5xl border-bm-border/50 bg-bm-surface/18",
              )}
            >
              <div className={cn("text-[11px] uppercase tracking-[0.18em]", isUser ? "text-bm-accent" : "text-bm-muted2")}>
                {isUser ? "You" : "Winston"}
              </div>
              {!isUser && message.responseBlocks?.length ? (
                <div className="mt-3 space-y-3">
                  {message.responseBlocks.map((block) => (
                    <ResponseBlockRenderer key={block.block_id} block={block} />
                  ))}
                  {message.content && !hasMarkdownBlock(message.responseBlocks) ? (
                    <div className="whitespace-pre-wrap text-sm leading-7 text-bm-text">{message.content}</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-bm-text">{message.content}</div>
              )}
            </article>
          );
        })}

        {thinking ? (
          <div className="max-w-4xl rounded-[28px] border border-bm-border/50 bg-bm-surface/12 px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Winston</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-bm-accent animate-pulse" />
              <span className="text-sm text-bm-muted">{thinkingStatus || "Working through the context..."}</span>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function ConversationComposer({
  compact = false,
  showAttach = false,
}: {
  compact?: boolean;
  showAttach?: boolean;
}) {
  const {
    activeLane,
    activeState,
    currentContext,
    setDraft,
    sendPrompt,
    uploadAttachment,
    removeAttachment,
  } = useWinstonCompanion();
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={cn("border-t border-bm-border/50", compact ? "px-4 py-4" : "px-6 py-5")}>
      {activeState.attachments.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {activeState.attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-full border border-bm-border/50 bg-bm-bg/70 px-3 py-1.5 text-xs text-bm-text"
            >
              <span>{attachment.name}</span>
              <span className="text-bm-muted2">{attachment.status}</span>
              <button
                type="button"
                onClick={() => removeAttachment(activeLane, attachment.id)}
                className="text-bm-muted2 hover:text-bm-text"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-bm-border/55 bg-bm-bg/70 p-3 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
        <textarea
          value={activeState.draft}
          onChange={(event) => setDraft(activeLane, event.target.value)}
          rows={compact ? 3 : 4}
          placeholder={currentContext ? `Ask Winston from ${laneLabel(activeLane).toLowerCase()} mode...` : "Ask Winston..."}
          data-testid="global-commandbar-input"
          className="min-h-[80px] w-full resize-none border-0 bg-transparent text-sm leading-6 text-bm-text outline-none placeholder:text-bm-muted2"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendPrompt(activeLane);
            }
          }}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-bm-muted2">
            <span className="rounded-full border border-bm-border/40 px-2 py-1">
              {laneLabel(activeLane)}
            </span>
            {currentContext?.scopeLabel ? <span>{currentContext.scopeLabel}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {showAttach ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAttachment(activeLane, file);
                    event.currentTarget.value = "";
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  Attach
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" onClick={() => void sendPrompt(activeLane)} disabled={activeState.thinking || !activeState.draft.trim()}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionStrip({ compact = false }: { compact?: boolean }) {
  const { currentContext, activeLane, setDraft } = useWinstonCompanion();

  if (!currentContext?.suggestions.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "px-4 pb-2" : "px-6 pb-2")}>
      {currentContext.suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => setDraft(activeLane, suggestion.prompt)}
          className="rounded-full border border-bm-border/50 bg-bm-surface/12 px-3 py-1.5 text-xs text-bm-muted transition hover:border-bm-accent/35 hover:text-bm-text"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

function LaneSwitcher() {
  const { activeLane, setActiveLane } = useWinstonCompanion();

  return (
    <div className="inline-flex rounded-full border border-bm-border/50 bg-bm-bg/70 p-1">
      {(["contextual", "general"] as const).map((lane) => (
        <button
          key={lane}
          type="button"
          onClick={() => setActiveLane(lane)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] transition",
            activeLane === lane ? "bg-bm-accent text-bm-accentContrast" : "text-bm-muted2 hover:text-bm-text",
          )}
        >
          {laneLabel(lane)}
        </button>
      ))}
    </div>
  );
}

function ContextCard() {
  const { currentContext, activeLane, contextualBinding, activeBinding, needsContextAdoption, adoptCurrentContext } = useWinstonCompanion();

  if (!currentContext) return null;

  return (
    <section className="rounded-[24px] border border-bm-border/50 bg-bm-surface/18 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Current context</p>
          <h2 className="mt-2 text-lg font-semibold text-bm-text">{currentContext.currentNarrative}</h2>
        </div>
        <LaneSwitcher />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
        <span className="rounded-full border border-bm-border/50 px-2.5 py-1">{currentContext.routeLabel}</span>
        {activeBinding?.scopeLabel ? <span className="rounded-full border border-bm-border/50 px-2.5 py-1">Thread: {activeBinding.scopeLabel}</span> : null}
      </div>
      {activeLane === "contextual" && contextualBinding?.scopeLabel && contextualBinding.scopeKey !== currentContext.scopeKey ? (
        <div className="mt-4 rounded-2xl border border-bm-accent/30 bg-bm-accent/10 p-3">
          <p className="text-sm text-bm-text">
            This thread is still pinned to <span className="font-semibold">{contextualBinding.scopeLabel}</span>.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={adoptCurrentContext} disabled={!needsContextAdoption}>
              Adopt Current Context
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RecentConversations() {
  const {
    activeLane,
    activeState,
    recentConversations,
    loadConversation,
    archiveConversationById,
  } = useWinstonCompanion();

  return (
    <section className="rounded-[24px] border border-bm-border/50 bg-bm-surface/14 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History size={15} className="text-bm-muted2" />
          <p className="text-sm font-semibold text-bm-text">Recent {laneLabel(activeLane).toLowerCase()} threads</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {recentConversations.length ? recentConversations.slice(0, 8).map((conversation) => {
          const active = conversation.conversation_id === activeState.conversationId;
          return (
            <div
              key={conversation.conversation_id}
              className={cn(
                "group rounded-2xl border p-3 transition",
                active ? "border-bm-accent/35 bg-bm-accent/10" : "border-bm-border/50 bg-bm-bg/60",
              )}
            >
              <button
                type="button"
                onClick={() => void loadConversation(conversation.conversation_id, activeLane)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-bm-text">
                      {conversation.title || conversation.scope_label || conversation.context_summary || "Untitled conversation"}
                    </p>
                    <p className="mt-1 text-xs text-bm-muted2">
                      {conversation.scope_label || laneLabel(conversation.thread_kind)} · {formatConversationTime(conversation.updated_at)}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-bm-muted2" />
                </div>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                  {conversation.message_count} messages
                </span>
                <button
                  type="button"
                  onClick={() => void archiveConversationById(conversation.conversation_id)}
                  className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[11px] text-bm-muted2 transition hover:border-bm-border/50 hover:text-bm-text"
                >
                  <Archive size={12} />
                  Archive
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-bm-border/50 px-3 py-4 text-sm text-bm-muted2">
            No saved threads yet for this lane.
          </div>
        )}
      </div>
    </section>
  );
}

function ExplorePanel() {
  const { currentContext, exploreQuery, setExploreQuery, exploreResults, exploreLoading } = useWinstonCompanion();

  if (!currentContext) return null;

  return (
    <section className="rounded-[24px] border border-bm-border/50 bg-bm-surface/14 p-4">
      <div className="flex items-center gap-2">
        <Compass size={15} className="text-bm-muted2" />
        <p className="text-sm font-semibold text-bm-text">Explore elsewhere</p>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-bm-border/50 bg-bm-bg/70 px-3 py-2">
        <Search size={14} className="text-bm-muted2" />
        <input
          value={exploreQuery}
          onChange={(event) => setExploreQuery(event.target.value)}
          placeholder={currentContext.searchPlaceholder}
          className="w-full border-0 bg-transparent text-sm text-bm-text outline-none placeholder:text-bm-muted2"
        />
      </div>
      <div className="mt-3 space-y-2">
        {exploreResults.length ? exploreResults.map((result) => (
          <Link
            key={result.id}
            href={result.href}
            className="flex items-center justify-between gap-3 rounded-2xl border border-bm-border/50 bg-bm-bg/60 px-3 py-3 text-sm transition hover:border-bm-accent/35 hover:bg-bm-surface/22"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-bm-text">{result.label}</p>
              <p className="mt-1 truncate text-xs text-bm-muted2">{result.description}</p>
            </div>
            <ArrowUpRight size={15} className="shrink-0 text-bm-muted2" />
          </Link>
        )) : (
          <div className="rounded-2xl border border-dashed border-bm-border/50 px-3 py-4 text-sm text-bm-muted2">
            Search funds, assets, models, investors, and related pages.
          </div>
        )}
      </div>
      {exploreLoading ? <p className="mt-3 text-xs text-bm-muted2">Searching the environment…</p> : null}
    </section>
  );
}

function AdvancedPanel() {
  const { contextEnvelope, activeState } = useWinstonCompanion();

  return (
    <details className="rounded-[24px] border border-bm-border/50 bg-bm-surface/12 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-bm-text">Advanced / Dev</summary>
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-bm-border/50 bg-bm-bg/70 p-3 text-xs text-bm-muted2">
          <p className="font-semibold text-bm-text">Latest trace</p>
          <p className="mt-2">Request ID: {activeState.trace?.requestId || "n/a"}</p>
          <p>Endpoint: {activeState.trace?.endpoint || "n/a"}</p>
          <p>Duration: {activeState.trace?.durationMs ? `${activeState.trace.durationMs}ms` : "n/a"}</p>
          <p>Tool events: {activeState.debug?.toolCalls.length || 0}</p>
        </div>
        <pre className="max-h-56 overflow-auto rounded-2xl border border-bm-border/50 bg-bm-bg/70 p-3 text-[11px] leading-5 text-bm-muted2">
          {JSON.stringify(contextEnvelope, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function WorkspaceUtilities({ drawer = false }: { drawer?: boolean }) {
  return (
    <div className={cn("space-y-4", drawer ? "" : "sticky top-6")}>
      <RecentConversations />
      <ExplorePanel />
      <AdvancedPanel />
    </div>
  );
}

function WorkspaceContent({
  drawer = false,
}: {
  drawer?: boolean;
}) {
  const { currentContext, activeState, activeLane, resetLane, openFullWorkspace } = useWinstonCompanion();

  return (
    <>
      <ContextCard />

      <section className={cn("overflow-hidden rounded-[28px] border border-bm-border/55 bg-bm-surface/10")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bm-border/45 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot size={15} className="text-bm-muted2" />
            <div>
              <p className="text-sm font-semibold text-bm-text">
                {activeLane === "contextual" ? "Pinned contextual thread" : "General Winston thread"}
              </p>
              <p className="text-xs text-bm-muted2">
                {currentContext?.scopeLabel || "Workspace"}{activeState.conversationId ? " · conversation attached" : " · new conversation"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => resetLane(activeLane)}>
              <MessageSquarePlus size={14} />
              New Thread
            </Button>
            {drawer ? (
              <Button type="button" size="sm" onClick={openFullWorkspace}>
                Open Winston
              </Button>
            ) : null}
          </div>
        </div>

        {activeState.messages.length === 0 ? (
          <div className={cn("border-b border-bm-border/40", drawer ? "px-4 py-6" : "px-6 py-8")}>
            <div className="rounded-[28px] border border-dashed border-bm-border/50 bg-bm-bg/45 p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Winston companion</p>
              <h2 className="mt-2 text-xl font-semibold text-bm-text">
                {currentContext?.currentNarrative || "Always-on operating companion"}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-bm-muted">
                Start from the current page, keep the thread pinned when it matters, or pivot into broader business-level exploration when you need to move.
              </p>
            </div>
          </div>
        ) : null}

        <SuggestionStrip compact={drawer} />
        <ThreadViewport
          messages={activeState.messages}
          thinking={activeState.thinking}
          thinkingStatus={activeState.thinkingStatus}
          compact={drawer}
        />
        <ConversationComposer compact={drawer} showAttach={!drawer} />
      </section>
    </>
  );
}

function useDialogFocusTrap(enabled: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || focusables.length === 0) return;

      const activeElement = document.activeElement as HTMLElement | null;
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onClose]);

  return dialogRef;
}

export function WinstonCompanionRoot() {
  const {
    open,
    shouldRender,
    launcherRaised,
    toggleDrawer,
    closeDrawer,
    currentContext,
  } = useWinstonCompanion();
  const dialogRef = useDialogFocusTrap(open, closeDrawer);

  if (!shouldRender) return null;

  return (
    <>
      <button
        type="button"
        data-testid="global-commandbar-toggle"
        onClick={toggleDrawer}
        aria-label={open ? "Close Winston companion" : "Open Winston companion"}
        className={cn(
          "fixed z-[45] flex h-16 w-16 items-center justify-center rounded-full border border-white/45 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.95),rgba(255,255,255,0.6)_35%,rgba(12,18,28,0.96)_100%)] shadow-[0_20px_60px_-28px_rgba(0,0,0,0.8)] transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_28px_80px_-30px_rgba(0,0,0,0.85)] active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none",
          companionLauncherOffsetClass(launcherRaised),
        )}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-bm-accent/10 opacity-70 animate-[pulse_6s_ease-in-out_infinite]" />
        <WinstonAvatar className="h-12 w-12 border-white/70 bg-white shadow-[0_10px_26px_-18px_rgba(0,0,0,0.7)]" priority />
      </button>

      <div
        className={cn(
          "fixed inset-0 z-[80] transition duration-300 motion-reduce:transition-none",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-950/35 backdrop-blur-[3px] transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={closeDrawer}
          aria-hidden="true"
        />

        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Winston companion"
          className={cn(
            "absolute right-0 top-0 flex h-full w-full max-w-[42rem] flex-col border-l border-white/10 bg-[linear-gradient(180deg,rgba(17,25,36,0.98),rgba(10,16,24,0.98))] shadow-[-32px_0_80px_-36px_rgba(0,0,0,0.85)] transition duration-300 motion-reduce:transition-none",
            "sm:w-[36rem]",
            open ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
          )}
        >
          <header className="border-b border-white/10 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <WinstonAvatar className="h-12 w-12 border-white/60 bg-white/95" priority />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Winston companion</p>
                  <h1 className="text-lg font-semibold text-white">Always-on operating companion</h1>
                  <p className="mt-1 text-sm text-slate-300">
                    {currentContext?.routeLabel || "Ready to help"}{currentContext?.envName ? ` · ${currentContext.envName}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Close Winston companion"
              >
                <PanelRightClose size={18} />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <WorkspaceContent drawer />
              <WorkspaceUtilities drawer />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function WinstonCompanionWorkspace() {
  const searchParams = useSearchParams();
  const { hydrateFromQuery, openDrawer, setActiveLane } = useWinstonCompanion();
  const conversationId = searchParams.get("conversation_id");
  const laneParam = searchParams.get("lane");

  useEffect(() => {
    if (laneParam === "general" || laneParam === "contextual") {
      setActiveLane(laneParam);
    }
    void hydrateFromQuery(conversationId, laneParam === "general" || laneParam === "contextual" ? laneParam : null);
  }, [conversationId, hydrateFromQuery, laneParam, setActiveLane]);

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-bm-border/55 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(19,27,39,0.96),rgba(11,17,26,0.94))] p-5 shadow-[0_28px_80px_-48px_rgba(0,0,0,0.8)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <WinstonAvatar className="h-16 w-16 border-white/70 bg-white/95" priority />
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Winston workspace</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">Full companion environment</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                Keep contextual threads pinned when you need precision, switch into general mode when you want broader business reasoning, and move across entities without losing your place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => openDrawer()}>
              <PanelRightClose size={14} />
              Open Drawer
            </Button>
            <Link
              href="/app/winston"
              className="inline-flex items-center gap-2 rounded-full border border-bm-border/50 px-4 py-2 text-sm text-bm-text transition hover:bg-bm-surface/20"
            >
              Global Winston
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <WorkspaceContent />
        </div>
        <WorkspaceUtilities />
      </div>
    </div>
  );
}
