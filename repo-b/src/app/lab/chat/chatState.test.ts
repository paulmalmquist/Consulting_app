import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/commandbar/assistantApi", () => ({
  createConversation: vi.fn(),
}));

import { createConversation } from "@/lib/commandbar/assistantApi";
import {
  clearChatState,
  conversationKey,
  ensureLabConversation,
  messagesKey,
  sessionKey,
} from "./chatState";

describe("lab chat state", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(createConversation).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reuses a stored conversation id before creating a new one", async () => {
    localStorage.setItem(conversationKey("env_123"), "conv_existing");

    const conversationId = await ensureLabConversation({
      env: {
        env_id: "env_123",
        client_name: "Meridian",
        business_id: "biz_123",
      },
      route: "/lab/chat",
    });

    assertNoConversationBootstrap();
    expect(conversationId).toBe("conv_existing");
  });

  it("creates and persists a conversation id on first send", async () => {
    vi.mocked(createConversation).mockResolvedValue({
      conversation_id: "conv_new",
      business_id: "biz_123",
      env_id: "env_123",
      title: null,
      thread_kind: "contextual",
      scope_type: "environment",
      scope_id: "env_123",
      scope_label: "Meridian",
      launch_source: "lab_chat",
      context_summary: null,
      last_route: "/lab/chat",
      messages: [],
    });

    const conversationId = await ensureLabConversation({
      env: {
        env_id: "env_123",
        client_name: "Meridian",
        business_id: "biz_123",
      },
      route: "/lab/chat",
    });

    expect(conversationId).toBe("conv_new");
    expect(localStorage.getItem(conversationKey("env_123"))).toBe("conv_new");
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: "biz_123",
        env_id: "env_123",
        thread_kind: "contextual",
        scope_type: "environment",
        scope_id: "env_123",
        scope_label: "Meridian",
        launch_source: "lab_chat",
        last_route: "/lab/chat",
      }),
    );
  });

  it("clears conversation state alongside messages and session", () => {
    localStorage.setItem(messagesKey("env_123"), "[]");
    localStorage.setItem(sessionKey("env_123"), "sess_123");
    localStorage.setItem(conversationKey("env_123"), "conv_123");

    clearChatState("env_123");

    expect(localStorage.getItem(messagesKey("env_123"))).toBeNull();
    expect(localStorage.getItem(sessionKey("env_123"))).toBeNull();
    expect(localStorage.getItem(conversationKey("env_123"))).toBeNull();
  });
});

function assertNoConversationBootstrap() {
  expect(createConversation).not.toHaveBeenCalled();
}
