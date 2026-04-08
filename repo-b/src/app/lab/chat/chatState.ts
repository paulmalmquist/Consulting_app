import type { Environment } from "@/components/EnvProvider";
import { createConversation } from "@/lib/commandbar/assistantApi";

export function messagesKey(envId: string) {
  return `demo_lab_chat_messages:${envId}`;
}

export function sessionKey(envId: string) {
  return `demo_lab_chat_session:${envId}`;
}

export function conversationKey(envId: string) {
  return `demo_lab_chat_conversation:${envId}`;
}

export function genSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `sess_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function loadStoredConversationId(envId: string): string | null {
  try {
    return localStorage.getItem(conversationKey(envId));
  } catch {
    return null;
  }
}

export function persistConversationId(envId: string, conversationId: string): void {
  try {
    localStorage.setItem(conversationKey(envId), conversationId);
  } catch {
    // ignore storage failures
  }
}

export function clearChatState(envId: string): void {
  try {
    localStorage.removeItem(messagesKey(envId));
    localStorage.removeItem(sessionKey(envId));
    localStorage.removeItem(conversationKey(envId));
  } catch {
    // ignore storage failures
  }
}

export async function ensureLabConversation(params: {
  env: Pick<Environment, "env_id" | "client_name" | "business_id">;
  existingConversationId?: string | null;
  route?: string | null;
}): Promise<string> {
  const existingConversationId = params.existingConversationId?.trim();
  if (existingConversationId) {
    return existingConversationId;
  }

  const storedConversationId = loadStoredConversationId(params.env.env_id)?.trim();
  if (storedConversationId) {
    return storedConversationId;
  }

  const businessId = params.env.business_id?.trim();
  if (!businessId) {
    throw new Error("This environment is missing a business_id, so chat continuity is unavailable.");
  }

  const detail = await createConversation({
    business_id: businessId,
    env_id: params.env.env_id,
    thread_kind: "contextual",
    scope_type: "environment",
    scope_id: params.env.env_id,
    scope_label: params.env.client_name,
    launch_source: "lab_chat",
    last_route: params.route || "/lab/chat",
  });
  persistConversationId(params.env.env_id, detail.conversation_id);
  return detail.conversation_id;
}
