"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Compass,
  History,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import type { CommandMessage } from "@/lib/commandbar/store";
import { useWinstonCompanion, companionLauncherOffsetClass } from "@/components/winston-companion/WinstonCompanionProvider";
import WinstonAvatar from "@/components/winston-companion/WinstonAvatar";
import RuntimePill from "@/components/winston-companion/RuntimePill";
import { useWinstonLoader } from "@/lib/loading-state";
import ResponseBlockRenderer from "@/components/copilot/ResponseBlockRenderer";
import SplitPane from "@/components/winston-companion/SplitPane";
import LoadingBlock from "@/components/winston-companion/LoadingBlock";
import { getGreeting } from "@/lib/winston-companion/greetings";
import { AttachmentTray } from "@/components/winston-companion/AttachmentTray";
import { FileDropZone } from "@/components/winston-companion/FileDropZone";

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
  const { activeLane, sendPrompt, setDraft, activeState, confirmPendingTool } = useWinstonCompanion();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, thinkingStatus]);

  const handleConfirm = (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => {
    if (block.tool_call_id && block.anthropic_session_id) {
      void confirmPendingTool(block, "allow");
      return;
    }
    void sendPrompt(activeLane, "Yes, confirm.");
  };
  const handleCancel = (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => {
    if (block.tool_call_id && block.anthropic_session_id) {
      void confirmPendingTool(block, "deny");
      return;
    }
    void sendPrompt(activeLane, "Cancel.");
  };
  const handleEdit = () => {
    setDraft(activeLane, "Actually, change ");
  };

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
                "rounded-2xl px-4 py-3",
                isUser
                  ? "ml-auto max-w-3xl bg-bm-accent/10"
                  : "max-w-5xl border border-bm-border/30 bg-bm-surface/20",
              )}
            >
              <div className={cn("nv-eyebrow", isUser ? "text-bm-accent" : "text-bm-muted2")}>
                {isUser ? "You" : "Winston"}
              </div>
              {!isUser && message.responseBlocks?.length ? (
                <div className="mt-3 space-y-3">
                  {message.responseBlocks.map((block) => (
                    <ResponseBlockRenderer
                      key={block.block_id}
                      block={block}
                      onConfirmAction={handleConfirm}
                      onCancelAction={handleCancel}
                      onEditAction={handleEdit}
                      executionResult={block.type === "confirmation" ? activeState.pendingActionResult : undefined}
                    />
                  ))}
                  {message.content && !hasMarkdownBlock(message.responseBlocks) ? (
                    <div className="nv-body max-w-none whitespace-pre-wrap text-bm-text">{message.content}</div>
                  ) : null}
                </div>
              ) : (
                <div className="nv-body mt-3 max-w-none whitespace-pre-wrap text-bm-text">{message.content}</div>
              )}
            </article>
          );
        })}

        {thinking ? (
          <div className="max-w-4xl rounded-2xl border border-bm-border/30 bg-bm-surface/20">
            <LoadingBlock message={thinkingStatus} />
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function ConversationComposer({
  compact = false,
  greeting,
}: {
  compact?: boolean;
  greeting?: string;
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
  const dragCountRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const ACCEPTED_EXTS = ".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json";
  const MAX_FILE_BYTES = 25 * 1024 * 1024;

  function handleFiles(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) continue;
      void uploadAttachment(activeLane, file);
    }
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current++;
    setDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current = 0;
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) void uploadAttachment(activeLane, file);
    }
  }

  // Use business name or a clean label — never show raw UUIDs
  const scopeDisplay = (() => {
    const label = currentContext?.scopeLabel;
    if (!label || label === "General") return null;
    if (/^[0-9a-f]{8}-/.test(label)) return currentContext?.businessName || null;
    return label;
  })();

  const placeholder = activeState.messages.length > 0
    ? scopeDisplay ? `Ask Winston about ${scopeDisplay}...` : "Ask Winston..."
    : (greeting ?? "How may I be of service?");

  const hasAttachments = activeState.attachments.length > 0;
  const hasTyped = !!activeState.draft.trim();
  const isProcessing = activeState.attachments.some(
    (a) => a.status === "uploading" || a.status === "indexing" || a.status === "classifying",
  );
  const sendDisabled = activeState.thinking || isProcessing || !activeState.draft.trim();
  const processingCount = activeState.attachments.filter(
    (a) => a.status === "uploading" || a.status === "indexing" || a.status === "classifying",
  ).length;

  return (
    <div
      className={cn(
        "border-t border-bm-border/50",
        compact ? "px-4 py-4" : "px-6 py-5",
        dragging && "bg-white/5",
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {hasAttachments && (
        <div className="mb-2">
          <AttachmentTray
            attachments={activeState.attachments}
            onRemove={(id) => removeAttachment(activeLane, id)}
          />
        </div>
      )}

      {!hasAttachments && !hasTyped && (
        <div className="mb-2">
          <FileDropZone onFiles={handleFiles} compact={false} />
        </div>
      )}
      {(hasAttachments || hasTyped) && (
        <div className="mb-2">
          <FileDropZone onFiles={handleFiles} compact={true} />
        </div>
      )}

      <div className="rounded-2xl border border-bm-border/40 bg-bm-bg p-3 shadow-sm">
        <textarea
          value={activeState.draft}
          onChange={(event) => setDraft(activeLane, event.target.value)}
          rows={compact ? 2 : 3}
          placeholder={placeholder}
          data-testid="global-commandbar-input"
          className="min-h-[60px] w-full resize-none border-0 bg-transparent text-sm leading-6 text-bm-text outline-none placeholder:text-bm-muted2"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!sendDisabled) void sendPrompt(activeLane);
            }
          }}
          onPaste={onPaste}
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_EXTS}
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              handleFiles(files);
              event.currentTarget.value = "";
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Attach
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void sendPrompt(activeLane)}
            disabled={sendDisabled}
            title={isProcessing ? `Waiting for ${processingCount} file${processingCount !== 1 ? "s" : ""} to finish processing` : undefined}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders backend-generated suggested actions (post-response only).
 *
 * Static pre-turn chips were intentionally removed — they trained users to click pills
 * instead of working with their own material. The dynamic post-response action rows
 * are kept because the assistant has actually read context before suggesting them.
 */
function PostResponseActions({ compact = false }: { compact?: boolean }) {
  const { activeLane, activeState, setDraft, sendPrompt } = useWinstonCompanion();
  const router = useRouter();

  const backendActions = activeState.suggestedActions || [];
  if (backendActions.length === 0 || activeState.messages.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "px-4 pb-2" : "px-6 pb-2")}>
      {backendActions.slice(0, 4).map((action, idx) => (
        <button
          key={`sa-${idx}`}
          type="button"
          onClick={() => {
            if (action.type === "navigate" && action.path) {
              router.push(action.path);
            } else if (action.message) {
              setDraft(activeLane, action.message);
              void sendPrompt(activeLane, action.message);
            }
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs transition",
            action.type === "navigate"
              ? "border-bm-accent/30 bg-bm-accent/8 text-bm-accent hover:bg-bm-accent/15"
              : "border-bm-border/50 bg-bm-surface/12 text-bm-muted hover:border-bm-accent/35 hover:text-bm-text"
          )}
        >
          {action.type === "navigate" ? "→ " : ""}{action.label}
        </button>
      ))}
    </div>
  );
}

/** Compact horizontal thread picker for drawer/mobile mode. */
function RecentThreadStrip() {
  const {
    activeLane,
    activeState,
    recentConversations,
    loadConversation,
    resetLane,
  } = useWinstonCompanion();

  if (!recentConversations.length) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => resetLane(activeLane)}
          className="shrink-0 rounded-full border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-medium text-bm-accent transition hover:bg-bm-accent/20"
        >
          + New
        </button>
        {recentConversations.slice(0, 6).map((conversation) => {
          const active = conversation.conversation_id === activeState.conversationId;
          return (
            <button
              key={conversation.conversation_id}
              type="button"
              onClick={() => void loadConversation(conversation.conversation_id, activeLane)}
              className={cn(
                "shrink-0 max-w-[160px] truncate rounded-full border px-3 py-1.5 text-xs transition",
                active
                  ? "border-bm-accent/40 bg-bm-accent/15 font-medium text-bm-text"
                  : "border-bm-border/50 bg-bm-bg/60 text-bm-muted2 hover:text-bm-text",
              )}
            >
              {conversation.title || conversation.scope_label || "Untitled"}
            </button>
          );
        })}
      </div>
    </div>
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
      <div className="flex items-center gap-2">
        <History size={15} className="text-bm-muted2" />
        <p className="nv-h3 text-bm-text">Recent threads</p>
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
                      {conversation.scope_label || ""} · {formatConversationTime(conversation.updated_at)}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-bm-muted2" />
                </div>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="nv-eyebrow text-bm-muted2">
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
            No saved threads yet.
          </div>
        )}
      </div>
    </section>
  );
}

function ExplorePanel({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const { currentContext, exploreQuery, setExploreQuery, exploreResults, exploreLoading } = useWinstonCompanion();
  const [open, setOpen] = useState(defaultOpen);

  if (!currentContext) return null;

  return (
    <section className="rounded-[24px] border border-bm-border/50 bg-bm-surface/14 p-4">
      <button
        type="button"
        className="flex w-full items-center gap-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Compass size={15} className="text-bm-muted2" />
        <p className="nv-h3 flex-1 text-left text-bm-text">Explore</p>
        <ChevronRight size={14} className={cn("text-bm-muted2 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-2xl border border-bm-border/50 bg-bm-bg/70 px-3 py-2">
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
          {exploreLoading ? <p className="mt-3 text-xs text-bm-muted2">Searching…</p> : null}
        </div>
      )}
    </section>
  );
}

function AdvancedPanel() {
  const { contextEnvelope, activeState } = useWinstonCompanion();

  return (
    <details className="rounded-[24px] border border-bm-border/50 bg-bm-surface/12 p-4">
      <summary className="nv-h3 cursor-pointer text-bm-text">Advanced / Dev</summary>
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-bm-border/50 bg-bm-bg/70 p-3 text-xs text-bm-muted2">
          <p className="nv-h3 text-bm-text">Latest trace</p>
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
      <ExplorePanel defaultOpen={!drawer} />
      <AdvancedPanel />
    </div>
  );
}

function WorkspaceContent({
  drawer = false,
}: {
  drawer?: boolean;
}) {
  const { currentContext, activeState, activeLane, resetLane } = useWinstonCompanion();

  const greeting = useMemo(
    () => getGreeting(currentContext?.routeLabel, currentContext?.scopeLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentContext?.routeLabel, currentContext?.scopeLabel],
  );

  return (
    <>
      {drawer ? <RecentThreadStrip /> : null}

      <section className={cn(
        "overflow-hidden rounded-[28px] border border-bm-border/55 bg-bm-surface/10",
        drawer && "flex min-h-0 flex-1 flex-col",
      )}>
        {/* Thread section header */}
        <div className={cn(
          "flex-shrink-0 flex items-center justify-between gap-3",
          drawer ? "px-4 py-2.5" : "px-4 py-3",
        )}>
          <div className="flex items-center gap-2 min-w-0">
            {drawer ? null : <Bot size={15} className="text-bm-muted2" />}
            {!drawer ? (
              <p className="nv-h3 text-bm-text">
                {activeLane === "contextual" ? "Contextual thread" : "General thread"}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => resetLane(activeLane)}>
            <MessageSquarePlus size={14} />
            {drawer ? null : "New Thread"}
          </Button>
        </div>

        {activeState.messages.length === 0 ? (
          <div className={cn("flex-shrink-0 border-t border-bm-border/30", drawer ? "px-4 py-4" : "px-6 py-8")}>
            <div className={cn(
              "rounded-[28px] border border-dashed border-bm-border/50 bg-bm-bg/45",
              drawer ? "p-4" : "p-6",
            )}>
              <h2 className={cn("nv-h2 text-bm-text", drawer ? "" : "mt-2")}>
                {greeting}
              </h2>
              {!drawer ? (
                <p className="mt-1 max-w-2xl text-sm leading-6 text-bm-muted">
                  Ask about the portfolio, run analyses, or investigate any entity.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <PostResponseActions compact={drawer} />
        <ThreadViewport
          messages={activeState.messages}
          thinking={activeState.thinking}
          thinkingStatus={activeState.thinkingStatus}
          compact={drawer}
        />
        <ConversationComposer compact={drawer} greeting={greeting} />
      </section>
    </>
  );
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

function useDialogFocusTrap(enabled: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled || !dialogRef.current) return;

    lastActiveElementRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    const focusables = focusableElements(dialog);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const composer = dialog.querySelector<HTMLTextAreaElement>('textarea[data-testid="global-commandbar-input"]');

    composer?.focus({ preventScroll: true });
    if (document.activeElement !== composer) {
      first?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastActiveElementRef.current?.focus({ preventScroll: true });
    };
  }, [enabled]);

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
  const loaderPhase = useWinstonLoader((s) => s.phase);
  const dialogRef = useDialogFocusTrap(open, closeDrawer);

  // Brief arrival glow when the loader transitions to complete/idle into this button
  const isArriving = loaderPhase === "complete";

  if (!shouldRender) return null;

  const scopeSubtitle = currentContext?.scopeLabel && currentContext.scopeLabel !== "General"
    ? currentContext.scopeLabel
    : null;

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
        {/* Persistent slow-pulse ring */}
        <span className="pointer-events-none absolute inset-0 rounded-full bg-bm-accent/10 opacity-70 animate-[pulse_6s_ease-in-out_infinite]" />
        {/* Arrival glow — fires once when loader resolves into this button */}
        {isArriving && (
          <span className="pointer-events-none absolute inset-[-4px] rounded-full border-2 border-bm-accent/60 animate-[loader-ring_0.9s_ease-out_forwards]" />
        )}
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
            "absolute inset-0 bg-black/30 dark:bg-black/50 transition-opacity duration-300 motion-reduce:transition-none",
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
            "absolute right-0 top-0 flex h-full w-full max-w-[42rem] flex-col border-l border-bm-border/30 bg-bm-bg shadow-[-32px_0_80px_-36px_rgba(0,0,0,0.5)] transition duration-300 motion-reduce:transition-none",
            "sm:w-[36rem]",
            open ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
          )}
        >
          <header className="border-b border-bm-border/40 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <WinstonAvatar className="h-9 w-9 shrink-0 border-bm-border/50 bg-bm-surface" priority />
                <div className="min-w-0">
                  <h1 className="nv-h3 text-bm-text">Ask Winston</h1>
                  {scopeSubtitle ? (
                    <p className="truncate text-xs text-bm-muted2">{scopeSubtitle}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RuntimePill />
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-full border border-bm-border/40 p-2 text-bm-muted transition hover:bg-bm-surface/40 hover:text-bm-text"
                  aria-label="Close Winston companion"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </header>

          <SplitPane
            chatPane={
              <div className="flex min-h-0 flex-1 flex-col py-2">
                <WorkspaceContent drawer />
              </div>
            }
            explorePane={
              <div className="px-4 pb-3 space-y-2">
                <ExplorePanel />
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}

export function WinstonCompanionWorkspace() {
  const searchParams = useSearchParams();
  const { hydrateFromQuery, setActiveLane } = useWinstonCompanion();
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
      <section className="rounded-[32px] border border-bm-border/55 bg-bm-surface/40 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <WinstonAvatar className="h-14 w-14 border-bm-border/50 bg-bm-surface" priority />
            <div className="min-w-0">
              <h1 className="nv-h2 text-bm-text">Ask Winston</h1>
              <p className="nv-body mt-1 max-w-2xl text-bm-muted">
                Context-aware threads pinned to your current page.
              </p>
            </div>
          </div>
          <RuntimePill className="shrink-0" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <WorkspaceContent />
        </div>
        <div className="hidden xl:block">
          <WorkspaceUtilities />
        </div>
      </div>

      <div className="space-y-3 xl:hidden">
        <details className="rounded-[24px] border border-bm-border/50 bg-bm-surface/12 p-4" open>
          <summary className="nv-h3 cursor-pointer text-bm-text">Recent threads</summary>
          <div className="mt-4">
            <RecentConversations />
          </div>
        </details>
        <details className="rounded-[24px] border border-bm-border/50 bg-bm-surface/12 p-4">
          <summary className="nv-h3 cursor-pointer text-bm-text">Explore</summary>
          <div className="mt-4 space-y-4">
            <ExplorePanel />
            <AdvancedPanel />
          </div>
        </details>
      </div>
    </div>
  );
}
