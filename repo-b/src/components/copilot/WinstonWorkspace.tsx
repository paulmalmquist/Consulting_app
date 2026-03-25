"use client";

import React from "react";
import { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { buildAssistantContextEnvelope } from "@/lib/commandbar/contextEnvelope";
import {
  createConversation,
  fetchContextSnapshot,
  getConversation,
  listConversations,
  streamAi,
  type ConversationSummary,
  type AssistantApiTrace,
} from "@/lib/commandbar/assistantApi";
import {
  makeMessage,
  type CommandMessage,
} from "@/lib/commandbar/store";
import type { AssistantArtifactRef, AssistantResponseBlock, CommandContext, ContextSnapshot } from "@/lib/commandbar/types";
import { completeUpload, computeSha256, initUpload } from "@/lib/bos-api";
import ConversationHistoryDrawer from "@/components/copilot/ConversationHistoryDrawer";
import ContextPanel from "@/components/copilot/ContextPanel";
import ConversationViewport from "@/components/copilot/ConversationViewport";
import Composer from "@/components/copilot/Composer";
import WinstonTopBar from "@/components/copilot/WinstonTopBar";
import type { CopilotAttachment } from "@/components/copilot/types";

function mapConversationMessages(messages: Array<{
  message_id: string;
  role: string;
  content: string;
  response_blocks?: AssistantResponseBlock[];
  message_meta?: Record<string, unknown>;
  created_at: string | null;
}>): CommandMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system")
    .map((message) => ({
      id: message.message_id,
      role: message.role as CommandMessage["role"],
      content: message.content,
      createdAt: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
      responseBlocks: message.response_blocks || [],
      messageMeta: message.message_meta || {},
    }));
}

function collectArtifactRefs(messages: CommandMessage[]): AssistantArtifactRef[] {
  const refs: AssistantArtifactRef[] = [];
  for (const message of messages) {
    for (const block of message.responseBlocks || []) {
      if (block.type === "chart" || block.type === "table" || block.type === "workflow_result") {
        refs.push({
          block_id: block.block_id,
          type: block.type,
          title: "title" in block ? (block.title || null) : null,
          summary: block.type === "workflow_result" ? block.summary : null,
          created_at: new Date(message.createdAt).toISOString(),
          metadata: {},
        });
      }
    }
  }
  return refs.slice(-8);
}

function allBlocks(messages: CommandMessage[]) {
  return messages.flatMap((message) => message.responseBlocks || []);
}

function exportConversationMarkdown(messages: CommandMessage[]) {
  const lines: string[] = ["# Winston Copilot Conversation", ""];
  for (const message of messages) {
    lines.push(`## ${message.role === "user" ? "User" : "Assistant"}`);
    lines.push("");
    if (message.content) lines.push(message.content, "");
    for (const block of message.responseBlocks || []) {
      if (block.type === "markdown_text") {
        lines.push(block.markdown, "");
      } else if (block.type === "chart") {
        lines.push(`- Chart: ${block.title} (${block.chart_type})`, "");
      } else if (block.type === "table") {
        lines.push(`- Table: ${block.title || block.block_id} (${block.rows.length} rows)`, "");
      } else if (block.type === "kpi_group") {
        lines.push(`- KPI Group: ${block.title || block.block_id}`, "");
      } else if (block.type === "workflow_result") {
        lines.push(`- Workflow: ${block.title} [${block.status}]`, `  ${block.summary}`, "");
      } else if (block.type === "citations") {
        lines.push(`- Citations: ${block.items.map((item) => item.label).join(", ")}`, "");
      } else if (block.type === "tool_activity") {
        lines.push(`- Tool activity: ${block.items.map((item) => `${item.tool_name} (${item.status})`).join(", ")}`, "");
      } else if (block.type === "confirmation") {
        lines.push(`- Confirmation required: ${block.action}`, "");
      } else if (block.type === "error") {
        lines.push(`- Error: ${block.message}`, "");
      }
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "winston-copilot-conversation.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function WinstonWorkspace({
  envId,
  businessId,
  environmentName,
}: {
  envId: string;
  businessId: string | null;
  environmentName?: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { push } = useToast();

  const [mode, setMode] = useState<"ask" | "analyze" | "act">("ask");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(searchParams.get("conversation_id"));
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string>();
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshot | null>(null);
  const [trace, setTrace] = useState<AssistantApiTrace | null>(null);
  const [attachments, setAttachments] = useState<CopilotAttachment[]>([]);
  const [activeFilters] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!businessId) return;
    void listConversations(businessId).then(setConversations).catch(() => undefined);
  }, [businessId]);

  useEffect(() => {
    if (!conversationId) return;
    void getConversation(conversationId).then((detail) => {
      if (!detail?.messages) return;
      setMessages(mapConversationMessages(detail.messages));
    });
  }, [conversationId]);

  useEffect(() => {
    if (!businessId) return;
    const context: CommandContext = {
      currentEnvId: envId,
      currentBusinessId: businessId,
      route: pathname,
      surface: "winston_workspace",
      activeModule: "copilot",
    };
    void fetchContextSnapshot(context)
      .then((result) => setContextSnapshot(result.snapshot))
      .catch(() => undefined);
  }, [businessId, envId, pathname]);

  async function loadConversation(conversationIdToLoad: string) {
    const detail = await getConversation(conversationIdToLoad);
    if (!detail?.messages) return;
    setConversationId(conversationIdToLoad);
    setMessages(mapConversationMessages(detail.messages));
    setHistoryOpen(false);
    startTransition(() => {
      router.replace(`/lab/env/${envId}/copilot?conversation_id=${conversationIdToLoad}`);
    });
  }

  function resetConversation() {
    setConversationId(null);
    setMessages([]);
    setThinking(false);
    setThinkingStatus(undefined);
    setAttachments([]);
    setTrace(null);
    startTransition(() => {
      router.replace(`/lab/env/${envId}/copilot`);
    });
  }

  async function uploadAttachment(file: File) {
    if (!businessId) return;
    const id = crypto.randomUUID();
    setAttachments((current) => [...current, { id, name: file.name, status: "uploading" }]);
    try {
      const init = await initUpload({
        business_id: businessId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        title: file.name,
        virtual_path: `copilot/${envId}/${file.name.replaceAll("/", "_")}`,
        env_id: envId,
      });
      const uploadRes = await fetch(init.signed_upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status})`);
      }
      const sha256 = await computeSha256(file);
      await completeUpload({
        document_id: init.document_id,
        version_id: init.version_id,
        sha256,
        byte_size: file.size,
        env_id: envId,
      });
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === id
            ? { ...attachment, document_id: init.document_id, version_id: init.version_id, status: "indexing" }
            : attachment,
        ),
      );
      await fetch("/api/ai/gateway/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: init.document_id,
          version_id: init.version_id,
          business_id: businessId,
          env_id: envId,
        }),
      });
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === id ? { ...attachment, status: "ready" } : attachment,
        ),
      );
    } catch (error) {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === id
            ? { ...attachment, status: "failed", error: error instanceof Error ? error.message : "Upload failed" }
            : attachment,
        ),
      );
    }
  }

  async function sendPrompt(promptOverride?: string) {
    const text = (promptOverride ?? prompt).trim();
    if (!text || !businessId || thinking) return;

    let nextConversationId = conversationId;
    if (!nextConversationId) {
      const conversation = await createConversation({ business_id: businessId, env_id: envId });
      nextConversationId = conversation.conversation_id;
      setConversationId(nextConversationId);
      startTransition(() => {
        router.replace(`/lab/env/${envId}/copilot?conversation_id=${nextConversationId}`);
      });
    }

    const userMessage = makeMessage("user", text);
    const assistantMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        responseBlocks: [],
        messageMeta: {},
      },
    ]);
    setPrompt("");
    setThinking(true);
    setThinkingStatus("Working on it...");

    const artifactRefs = collectArtifactRefs(messages);
    const envelope = buildAssistantContextEnvelope({
      context: {
        currentEnvId: envId,
        currentBusinessId: businessId,
        route: pathname,
        surface: "winston_workspace",
        activeModule: "copilot",
      },
      snapshot: contextSnapshot,
      conversationId: nextConversationId,
      launchSource: "winston_copilot_workspace",
    });
    envelope.ui.active_filters = activeFilters;
    envelope.ui.visible_data = {
      ...(envelope.ui.visible_data || {}),
      documents: attachments
        .filter((attachment) => attachment.status === "ready" && attachment.document_id)
        .map((attachment) => ({
          entity_type: "document",
          entity_id: attachment.document_id!,
          name: attachment.name,
          status: attachment.status,
        })),
    };
    envelope.thread.mode = mode;
    envelope.thread.active_artifact_id = artifactRefs[artifactRefs.length - 1]?.block_id || null;
    envelope.thread.artifact_refs = artifactRefs;

    const updateAssistantMessage = (updater: (message: CommandMessage) => CommandMessage) => {
      setMessages((current) =>
        current.map((message) => (message.id === assistantMessageId ? updater(message) : message)),
      );
    };

    try {
      const result = await streamAi({
        message: text,
        business_id: businessId,
        env_id: envId,
        conversation_id: nextConversationId,
        context_envelope: envelope,
        onStatus: (status) => {
          setThinkingStatus(status);
          updateAssistantMessage((message) => ({
            ...message,
            messageMeta: { ...(message.messageMeta || {}), status },
          }));
        },
        onToken: (token) => {
          updateAssistantMessage((message) => ({
            ...message,
            content: `${message.content}${token}`,
          }));
        },
        onResponseBlock: (block) => {
          updateAssistantMessage((message) => ({
            ...message,
            responseBlocks: [...(message.responseBlocks || []).filter((item) => item.block_id !== block.block_id), block],
          }));
        },
      });
      setTrace(result.trace);
      updateAssistantMessage((message) => ({
        ...message,
        content: result.answer,
        responseBlocks: result.blocks.length ? result.blocks : message.responseBlocks,
        messageMeta: { ...(message.messageMeta || {}), trace: result.debug.trace },
      }));
      void listConversations(businessId).then(setConversations).catch(() => undefined);
    } catch (error) {
      updateAssistantMessage((message) => ({
        ...message,
        content: error instanceof Error ? error.message : "Winston encountered an error.",
      }));
      push({
        title: "Copilot request failed",
        description: error instanceof Error ? error.message : "Unknown assistant error.",
        variant: "danger",
      });
    } finally {
      setThinking(false);
      setThinkingStatus(undefined);
      if (nextConversationId) {
        void getConversation(nextConversationId).then((detail) => {
          if (!detail?.messages) return;
          setMessages(mapConversationMessages(detail.messages));
        });
      }
    }
  }

  const blocks = allBlocks(messages);
  const selectedContext = [
    { label: "Environment", value: environmentName || envId },
    { label: "Business", value: businessId },
    { label: "Conversation", value: conversationId },
    { label: "Trace", value: trace?.requestId || null },
  ];

  return (
    <div className="relative flex h-[calc(100vh-6rem)] min-h-[720px] flex-col overflow-hidden rounded-3xl border border-bm-border/60 bg-bm-bg shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
      <ConversationHistoryDrawer
        open={historyOpen}
        conversations={conversations}
        activeConversationId={conversationId}
        onClose={() => setHistoryOpen(false)}
        onSelectConversation={(id) => void loadConversation(id)}
      />
      <WinstonTopBar
        environmentName={environmentName}
        mode={mode}
        onModeChange={setMode}
        onNewChat={resetConversation}
        onSaveConversation={() => push({ title: "Conversation saved", description: "Winston conversations are persisted automatically.", variant: "success" })}
        onClearContext={resetConversation}
        onExportConversation={() => exportConversationMarkdown(messages)}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col">
          <ConversationViewport
            messages={messages}
            thinking={thinking}
            thinkingStatus={thinkingStatus}
            onConfirmAction={() => void sendPrompt("Proceed.")}
          />
          <Composer
            prompt={prompt}
            onPromptChange={setPrompt}
            onSend={() => void sendPrompt()}
            onFileSelected={(file) => void uploadAttachment(file)}
            onRemoveAttachment={(attachmentId) => {
              setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
            }}
            attachments={attachments}
            suggestions={[
              "What funds do we have and what are their key metrics?",
              "Plot NOI over time by investment.",
              "Compare actual vs budget NOI.",
              "Create a new fund called Sun Ridge Income Fund.",
            ]}
            disabled={thinking}
          />
        </div>
        <ContextPanel
          environmentName={environmentName}
          envId={envId}
          businessId={businessId}
          mode={mode}
          filters={activeFilters}
          selectedContext={selectedContext}
          blocks={blocks}
          attachments={attachments}
          status={thinkingStatus}
        />
      </div>
    </div>
  );
}
