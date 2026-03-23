"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  type AssistantApiTrace,
  type AssistantToolEvent,
  type ConversationSummary,
  type WinstonTrace,
  streamAi,
  fetchContextSnapshot,
  createConversation,
  listConversations,
} from "@/lib/commandbar/assistantApi";
import { buildAssistantContextEnvelope } from "@/lib/commandbar/contextEnvelope";
import {
  type CommandContextKey,
  type CommandMessage,
  type StructuredResult,
  type StructuredResultAction,
  type WaterfallRunSummary,
  loadHistoryState,
  makeMessage,
  persistHistoryState,
  resolveCommandContext,
} from "@/lib/commandbar/store";
import type {
  AssistantResponseBlock,
  AssistantCitationItem,
  AssistantToolActivityItem,
  CommandContext,
  ContextSnapshot,
} from "@/lib/commandbar/types";

import ChatHeader from "./ChatHeader";
import ChatConversationArea from "./ChatConversationArea";
import ChatPromptComposer from "./ChatPromptComposer";
import ChatContextPanel, { type ContextPanelState } from "./ChatContextPanel";

function readContextFromBrowser(pathname: string): CommandContext {
  if (typeof window === "undefined") return { route: pathname || "/" };
  const envFromRoute = pathname.match(/^\/lab\/env\/([^/]+)/)?.[1] || null;
  const envFromStorage = window.localStorage.getItem("demo_lab_env_id");
  const businessId = window.localStorage.getItem("bos_business_id");

  return {
    currentEnvId: envFromRoute || envFromStorage || null,
    currentBusinessId: businessId || null,
    route: pathname || window.location.pathname,
  };
}

function workspaceFromContext(snapshot: ContextSnapshot | null, fallback: CommandContext) {
  return {
    env: snapshot?.selectedEnv?.client_name || fallback.currentEnvId || "none",
    business: snapshot?.business?.name || fallback.currentBusinessId || "none",
    route: snapshot?.route || fallback.route || "/",
  };
}

export default function WinstonChatWorkspace() {
  const pathname = usePathname();

  // Core chat state
  const [contextKey, setContextKey] = useState<CommandContextKey>("global");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [waterfallRuns, setWaterfallRuns] = useState<WaterfallRunSummary[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | undefined>();

  // Context state
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshot | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  // Right rail state
  const [contextPanel, setContextPanel] = useState<ContextPanelState>({
    tools: [],
    citations: [],
  });

  const abortRef = useRef<AbortController | null>(null);
  const tokenBufferRef = useRef<string>("");
  const tokenFlushTimerRef = useRef<number | null>(null);

  const context = useMemo(() => readContextFromBrowser(pathname), [pathname]);
  const workspace = useMemo(() => workspaceFromContext(contextSnapshot, context), [contextSnapshot, context]);

  // Load history on mount
  useEffect(() => {
    const key = resolveCommandContext();
    setContextKey(key);
    const history = loadHistoryState(key);
    setMessages(history.messages);
    setWaterfallRuns(history.waterfallRuns);
  }, []);

  // Persist history
  useEffect(() => {
    persistHistoryState(contextKey, { messages, waterfallRuns });
  }, [contextKey, messages, waterfallRuns]);

  // Fetch context snapshot on mount
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const payload = await fetchContextSnapshot(context);
        if (cancelled) return;
        setContextSnapshot(payload.snapshot);
        setContextPanel((prev) => ({
          ...prev,
          envName: payload.snapshot.selectedEnv?.client_name || null,
          businessName: payload.snapshot.business?.name || null,
        }));
      } catch {
        // Non-fatal
      }
    };
    void refresh();
    return () => { cancelled = true; };
  }, [context]);

  // Load conversations
  useEffect(() => {
    if (!context.currentBusinessId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const list = await listConversations(context.currentBusinessId!);
        if (!cancelled) setConversations(list);
      } catch {
        // Non-fatal
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [context.currentBusinessId]);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setWaterfallRuns([]);
    persistHistoryState(contextKey, { messages: [], waterfallRuns: [] });
    setPrompt("");
    setConversationId(null);
    setBusy(false);
    setThinkingStatus(undefined);
    setContextPanel({ tools: [], citations: [] });
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [contextKey]);

  const handleSend = useCallback(async () => {
    const input = prompt.trim();
    if (!input || busy) return;

    // Add user message
    const userMsg = makeMessage("user", input);
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setBusy(true);
    setThinkingStatus(undefined);

    // Reset context panel for new query
    setContextPanel((prev) => ({
      ...prev,
      tools: [],
      citations: [],
      trace: null,
      entityName: null,
      entityType: null,
    }));

    // Create placeholder assistant message
    const assistantMsgId = `msg_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    const assistantMsg: CommandMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      responseBlocks: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const snapshot = contextSnapshot || (await fetchContextSnapshot(context).then((p) => {
        setContextSnapshot(p.snapshot);
        return p.snapshot;
      }));

      const derivedBusinessId = context.currentBusinessId || snapshot?.business?.business_id || snapshot?.selectedEnv?.business_id || null;
      const derivedEnvId = context.currentEnvId || snapshot?.selectedEnv?.env_id || null;

      const contextEnvelope = buildAssistantContextEnvelope({
        context: { ...context, currentBusinessId: derivedBusinessId, currentEnvId: derivedEnvId },
        snapshot,
        conversationId,
        launchSource: "winston_workspace",
      });

      const effectiveBusinessId = contextEnvelope.ui.active_business_id || contextEnvelope.session.org_id || derivedBusinessId || undefined;
      const effectiveEnvId = contextEnvelope.ui.active_environment_id || contextEnvelope.session.session_env_id || derivedEnvId || undefined;

      // Auto-create conversation
      let activeConvoId = conversationId;
      if (!activeConvoId && effectiveBusinessId) {
        try {
          const convo = await createConversation({
            business_id: effectiveBusinessId,
            env_id: effectiveEnvId || undefined,
          });
          activeConvoId = convo.conversation_id;
          setConversationId(activeConvoId);
          contextEnvelope.thread.thread_id = activeConvoId;
        } catch {
          // Non-fatal
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const result = await streamAi({
        message: input,
        workspace: workspace as Record<string, string>,
        business_id: effectiveBusinessId,
        env_id: effectiveEnvId,
        conversation_id: activeConvoId || undefined,
        context_envelope: contextEnvelope,
        signal: controller.signal,
        onStatus: (status) => {
          setThinkingStatus(status);
        },
        onToken: (token) => {
          // Buffer tokens and flush every 50ms to reduce React re-renders
          tokenBufferRef.current += token;
          if (!tokenFlushTimerRef.current) {
            tokenFlushTimerRef.current = window.setTimeout(() => {
              const buffered = tokenBufferRef.current;
              tokenBufferRef.current = "";
              tokenFlushTimerRef.current = null;
              if (buffered) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.id === assistantMsgId) {
                    last.content += buffered;
                  }
                  return updated;
                });
              }
            }, 50);
          }
        },
        onResponseBlock: (block) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.id === assistantMsgId) {
              last.responseBlocks = [...(last.responseBlocks || []), block];
            }
            return updated;
          });
        },
        onToolActivity: (event) => {
          setContextPanel((prev) => ({
            ...prev,
            tools: [
              ...prev.tools,
              {
                tool_name: event.tool_name,
                label: event.label || "Processing",
                status: event.success === false ? "failed" : "completed",
                summary: event.success === false ? "Some data could not be retrieved" : (event.label || "Done"),
                duration_ms: event.duration_ms,
                is_write: event.is_write,
              },
            ],
          }));
        },
        onContext: (payload) => {
          const scope = payload?.resolvedScope;
          if (scope) {
            setContextPanel((prev) => ({
              ...prev,
              entityName: scope.entity_name || null,
              entityType: scope.entity_type || null,
              scopeType: scope.resolved_scope_type || null,
            }));
          }
        },
        onDone: (payload) => {
          // Flush any remaining buffered tokens
          if (tokenFlushTimerRef.current) {
            clearTimeout(tokenFlushTimerRef.current);
            tokenFlushTimerRef.current = null;
          }
          const remaining = tokenBufferRef.current;
          tokenBufferRef.current = "";
          if (remaining) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.id === assistantMsgId) {
                last.content += remaining;
              }
              return updated;
            });
          }

          const trace = payload?.trace as WinstonTrace | undefined;
          if (trace) {
            setContextPanel((prev) => ({ ...prev, trace }));
          }

          // Extract structured results
          const structuredResults = (payload as Record<string, unknown>)?.structured_results as StructuredResult[] | undefined;
          if (structuredResults && structuredResults.length > 0) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.id === assistantMsgId) {
                last.structuredResult = structuredResults[0];

                // Track waterfall runs
                const card = structuredResults[0].card;
                if (card?.session_waterfall_runs) {
                  setWaterfallRuns((wr) => {
                    const next = [...wr];
                    for (const run of card.session_waterfall_runs!) {
                      if (!next.some((r) => r.run_id === run.run_id)) {
                        next.push(run);
                      }
                    }
                    return next;
                  });
                }
              }
              return updated;
            });
          }

          // Extract citations from response blocks
          const responseBlocks = (payload as Record<string, unknown>)?.response_blocks as AssistantResponseBlock[] | undefined;
          if (responseBlocks) {
            const citationBlocks = responseBlocks.filter((b): b is Extract<AssistantResponseBlock, { type: "citations" }> => b.type === "citations");
            for (const cb of citationBlocks) {
              setContextPanel((prev) => ({
                ...prev,
                citations: [...prev.citations, ...cb.items],
              }));
            }
          }
        },
      });

      // Finalize the assistant message with the complete answer if streaming didn't populate it
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.id === assistantMsgId && !last.content && result.answer) {
          last.content = result.answer;
        }
        // Merge any blocks from the final result that weren't streamed
        if (last?.id === assistantMsgId && result.blocks.length > 0) {
          const existingIds = new Set((last.responseBlocks || []).map((b) => b.block_id));
          const newBlocks = result.blocks.filter((b) => !existingIds.has(b.block_id));
          if (newBlocks.length > 0) {
            last.responseBlocks = [...(last.responseBlocks || []), ...newBlocks];
          }
        }
        return updated;
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.id === assistantMsgId) {
          last.content = `Winston is unavailable. ${errMsg}`;
        }
        return updated;
      });
    } finally {
      setBusy(false);
      setThinkingStatus(undefined);
      abortRef.current = null;
    }
  }, [prompt, busy, context, contextSnapshot, conversationId, workspace]);

  const handleAction = useCallback((action: StructuredResultAction) => {
    if (action.action === "open_dashboard" && action.params) {
      const envId = context.currentEnvId || contextSnapshot?.selectedEnv?.env_id;
      const specKey = (action.params as Record<string, string>).spec_key;
      if (envId && specKey) {
        window.location.href = `/lab/env/${envId}/re/dashboards?from_winston=${specKey}`;
      }
    }
  }, [context.currentEnvId, contextSnapshot]);

  const handleExampleClick = useCallback((example: string) => {
    setPrompt(example);
  }, []);

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col bg-bm-bg">
      <ChatHeader
        envName={contextPanel.envName || contextSnapshot?.selectedEnv?.client_name}
        businessName={contextPanel.businessName || contextSnapshot?.business?.name}
        conversationCount={conversations.length}
        onNewChat={startNewConversation}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main conversation area */}
        <div className="flex flex-1 min-w-0 flex-col">
          <ChatConversationArea
            messages={messages}
            thinking={busy}
            thinkingStatus={thinkingStatus}
            onAction={handleAction}
            onExampleClick={handleExampleClick}
          />
          <ChatPromptComposer
            value={prompt}
            onChange={setPrompt}
            onSend={handleSend}
            busy={busy}
          />
        </div>
        {/* Right rail */}
        <aside className="hidden lg:block w-72 border-l border-bm-border/30 bg-bm-bg/50 overflow-hidden flex-shrink-0">
          <ChatContextPanel state={contextPanel} />
        </aside>
      </div>
    </div>
  );
}
