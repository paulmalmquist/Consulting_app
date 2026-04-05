import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { publishAssistantEnvironmentContext, publishAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { WinstonCompanionProvider } from "@/components/winston-companion/WinstonCompanionProvider";
import { WinstonCompanionRoot } from "@/components/winston-companion/WinstonCompanionSurface";

const mockPathname = vi.fn();
const mockRouterPush = vi.fn();
const mockFetchContextSnapshot = vi.fn();
const mockListConversations = vi.fn();
const mockCreateConversation = vi.fn();
const mockStreamAi = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/commandbar/assistantApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/commandbar/assistantApi")>("@/lib/commandbar/assistantApi");
  return {
    ...actual,
    fetchContextSnapshot: (...args: unknown[]) => mockFetchContextSnapshot(...args),
    listConversations: (...args: unknown[]) => mockListConversations(...args),
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    streamAi: (...args: unknown[]) => mockStreamAi(...args),
    getConversation: vi.fn(async () => null),
    archiveConversation: vi.fn(async () => undefined),
  };
});

function mountCompanion() {
  return render(
    <WinstonCompanionProvider>
      <WinstonCompanionRoot />
    </WinstonCompanionProvider>,
  );
}

function publishFundContext() {
  publishAssistantEnvironmentContext({
    active_environment_id: "env_1",
    active_environment_name: "Meridian Capital Management",
    active_business_id: "biz_1",
    active_business_name: "Meridian Capital Management",
    schema_name: "meridian",
    industry: "repe",
  });
  publishAssistantPageContext({
    route: "/lab/env/env_1/re/funds/fund_1",
    surface: "fund_detail",
    active_module: "re",
    page_entity_type: "fund",
    page_entity_id: "fund_1",
    page_entity_name: "Institutional Growth Fund VII",
    selected_entities: [
      {
        entity_type: "fund",
        entity_id: "fund_1",
        name: "Institutional Growth Fund VII",
        source: "page",
      },
    ],
    visible_data: {
      funds: [{ entity_type: "fund", entity_id: "fund_1", name: "Institutional Growth Fund VII" }],
    },
  });
}

function publishOverviewContext() {
  publishAssistantEnvironmentContext({
    active_environment_id: "env_1",
    active_environment_name: "Meridian Capital Management",
    active_business_id: "biz_1",
    active_business_name: "Meridian Capital Management",
  });
  publishAssistantPageContext({
    route: "/lab/env/env_1/re",
    surface: "re_workspace",
    active_module: "re",
    page_entity_type: "environment",
    page_entity_id: "env_1",
    page_entity_name: "Meridian Capital Management",
    selected_entities: [],
    visible_data: {
      funds: [{ entity_type: "fund", entity_id: "fund_1", name: "Institutional Growth Fund VII" }],
    },
  });
}

describe("WinstonCompanionProvider first-mile continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mockPathname.mockReturnValue("/lab/env/env_1/re/funds/fund_1");
    mockFetchContextSnapshot.mockResolvedValue({
      snapshot: {
        route: "/lab/env/env_1/re/funds/fund_1",
        environments: [],
        selectedEnv: {
          env_id: "env_1",
          client_name: "Meridian Capital Management",
          business_id: "biz_1",
        },
        business: {
          business_id: "biz_1",
          name: "Meridian Capital Management",
        },
        modulesAvailable: ["re"],
        recentRuns: [],
      },
    });
    mockListConversations.mockResolvedValue([]);
    publishFundContext();
  });

  it("boots successfully on a supported fund detail surface and preserves scope into the follow-up turn", async () => {
    mockCreateConversation.mockResolvedValue({
      conversation_id: "convo_1",
      business_id: "biz_1",
      env_id: "env_1",
      title: "Institutional Growth Fund VII",
      thread_kind: "contextual",
      scope_type: "fund",
      scope_id: "fund_1",
      scope_label: "Institutional Growth Fund VII",
      launch_source: "winston_companion_contextual",
      context_summary: "Institutional Growth Fund VII",
      last_route: "/lab/env/env_1/re/funds/fund_1",
      messages: [],
    });
    mockStreamAi
      .mockImplementationOnce(async (input: any) => {
        input.onStatus?.("Starting");
        input.onToken?.("I have the fund selected. ");
        input.onToken?.("What period should I use?");
        input.onDone?.({ terminal_state: "complete" });
        return { answer: "I have the fund selected. What period should I use?", trace: null, debug: null } as any;
      })
      .mockImplementationOnce(async (input: any) => {
        input.onToken?.("Using the same fund scope.");
        input.onDone?.({ terminal_state: "complete" });
        return { answer: "Using the same fund scope.", trace: null, debug: null } as any;
      });

    mountCompanion();
    fireEvent.click(await screen.findByTestId("global-commandbar-toggle"));
    fireEvent.change(await screen.findByTestId("global-commandbar-input"), {
      target: { value: "Give me a summary of this fund please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText(/What period should I use\?/i);

    fireEvent.change(screen.getByTestId("global-commandbar-input"), {
      target: { value: "Use the trailing twelve months" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText(/Using the same fund scope\./i);

    expect(mockCreateConversation).toHaveBeenCalledTimes(1);
    expect(mockStreamAi).toHaveBeenCalledTimes(2);
    expect(mockStreamAi.mock.calls[0]?.[0]).toMatchObject({
      conversation_id: "convo_1",
      pending_continuation: false,
      context_envelope: {
        thread: {
          scope_type: "fund",
          scope_id: "fund_1",
        },
      },
    });
    expect(mockStreamAi.mock.calls[1]?.[0]).toMatchObject({
      conversation_id: "convo_1",
      pending_continuation: true,
      pending_question_text: "I have the fund selected. What period should I use?",
      context_envelope: {
        thread: {
          scope_type: "fund",
          scope_id: "fund_1",
        },
      },
    });
  });

  it("shows the bootstrap error when conversation creation fails on a supported surface", async () => {
    mockCreateConversation.mockRejectedValue(new Error('column "thread_kind" does not exist'));

    mountCompanion();
    fireEvent.click(await screen.findByTestId("global-commandbar-toggle"));
    fireEvent.change(await screen.findByTestId("global-commandbar-input"), {
      target: { value: "Give me a summary of this fund please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Something went wrong starting the conversation. Please try again.");
    expect(mockStreamAi).not.toHaveBeenCalled();
  });

  it("shows the response error when streaming fails after bootstrap succeeds", async () => {
    mockCreateConversation.mockResolvedValue({
      conversation_id: "convo_1",
      business_id: "biz_1",
      env_id: "env_1",
      title: "Institutional Growth Fund VII",
      thread_kind: "contextual",
      scope_type: "fund",
      scope_id: "fund_1",
      scope_label: "Institutional Growth Fund VII",
      launch_source: "winston_companion_contextual",
      context_summary: "Institutional Growth Fund VII",
      last_route: "/lab/env/env_1/re/funds/fund_1",
      messages: [],
    });
    mockStreamAi.mockRejectedValue(new Error("stream failed"));

    mountCompanion();
    fireEvent.click(await screen.findByTestId("global-commandbar-toggle"));
    fireEvent.change(await screen.findByTestId("global-commandbar-input"), {
      target: { value: "Give me a summary of this fund please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Winston ran into a response error. Please try again.");
  });

  it("does not wipe the active thread scope when page context republishes after boot", async () => {
    mockCreateConversation.mockResolvedValue({
      conversation_id: "convo_1",
      business_id: "biz_1",
      env_id: "env_1",
      title: "Institutional Growth Fund VII",
      thread_kind: "contextual",
      scope_type: "fund",
      scope_id: "fund_1",
      scope_label: "Institutional Growth Fund VII",
      launch_source: "winston_companion_contextual",
      context_summary: "Institutional Growth Fund VII",
      last_route: "/lab/env/env_1/re/funds/fund_1",
      messages: [],
    });
    mockStreamAi
      .mockImplementationOnce(async (input: any) => {
        input.onToken?.("Fund selected.");
        input.onDone?.({ terminal_state: "complete" });
        return { answer: "Fund selected.", trace: null, debug: null } as any;
      })
      .mockImplementationOnce(async (input: any) => {
        input.onToken?.("Still using the fund thread.");
        input.onDone?.({ terminal_state: "complete" });
        return { answer: "Still using the fund thread.", trace: null, debug: null } as any;
      });

    mountCompanion();
    fireEvent.click(await screen.findByTestId("global-commandbar-toggle"));
    fireEvent.change(await screen.findByTestId("global-commandbar-input"), {
      target: { value: "Summarize this fund" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Fund selected.");

    mockPathname.mockReturnValue("/lab/env/env_1/re");
    publishOverviewContext();

    fireEvent.change(screen.getByTestId("global-commandbar-input"), {
      target: { value: "Keep going" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Still using the fund thread.");

    await waitFor(() => {
      expect(mockStreamAi.mock.calls[1]?.[0]).toMatchObject({
        conversation_id: "convo_1",
        context_envelope: {
          thread: {
            scope_type: "fund",
            scope_id: "fund_1",
          },
        },
      });
    });
  });
});
