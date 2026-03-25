import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextEnvelope } from "@/lib/commandbar/types";
import {
  AssistantApiError,
  askAi,
  checkCodexHealth,
  createPlan,
  fetchContextSnapshot,
} from "@/lib/commandbar/assistantApi";
import { ContractValidationError } from "@/lib/commandbar/schemas";

describe("assistantApi contract behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws 401 for unauthenticated context snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(fetchContextSnapshot({ route: "/lab/environments" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws validation error when /plan payload is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/mcp/plan")) {
          return new Response(JSON.stringify({ plan_id: "plan_bad" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            route: "/lab/environments",
            environments: [],
            selectedEnv: null,
            business: null,
            modulesAvailable: ["environments"],
            recentRuns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    await expect(
      createPlan({
        message: "list environments",
        context: { route: "/lab/environments" },
        contextSnapshot: {
          route: "/lab/environments",
          environments: [],
          selectedEnv: null,
          business: null,
          modulesAvailable: ["environments"],
          recentRuns: [],
        },
      })
    ).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("reports 403 from codex health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "disabled" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(checkCodexHealth()).rejects.toMatchObject({
      status: 403,
    });
  });

  it("surfaces network timeout-style failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network timeout");
      })
    );

    await expect(checkCodexHealth()).rejects.toBeInstanceOf(AssistantApiError);
  });

  it("posts the context envelope and captures debug SSE events", async () => {
    const contextEnvelope: AssistantContextEnvelope = {
      session: {
        roles: ["env_user"],
        org_id: "biz_123",
        session_env_id: "env_123",
      },
      ui: {
        route: "/lab/env/env_123/re/funds",
        surface: "fund_portfolio",
        active_environment_id: "env_123",
        active_business_id: "biz_123",
        page_entity_type: "environment",
        page_entity_id: "env_123",
        selected_entities: [],
        visible_data: {
          funds: [{ entity_type: "fund", entity_id: "fund_1", name: "IGF VII" }],
        },
      },
      thread: {
        assistant_mode: "environment_copilot",
        scope_type: "environment",
        scope_id: "env_123",
        launch_source: "winston_modal",
      },
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: context\ndata: ${JSON.stringify({
          context_envelope: contextEnvelope,
          resolved_scope: {
            resolved_scope_type: "environment",
            environment_id: "env_123",
            business_id: "biz_123",
            confidence: 0.98,
            source: "ui_context",
          },
        })}\n\n`));
        controller.enqueue(encoder.encode(`event: tool_call\ndata: ${JSON.stringify({
          tool_name: "repe.get_environment_snapshot",
          args: {},
          result_preview: "{\"fund_count\":1}",
        })}\n\n`));
        controller.enqueue(encoder.encode(`event: tool_result\ndata: ${JSON.stringify({
          tool_name: "repe.get_environment_snapshot",
          args: {},
          result: { fund_count: 1 },
        })}\n\n`));
        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ text: "IGF VII" })}\n\n`));
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ tool_calls: 1 })}\n\n`));
        controller.close();
      },
    });

    const fetchMock = vi.fn<typeof fetch>(async (..._args) =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await askAi({
      message: "which funds do we have?",
      business_id: "biz_123",
      env_id: "env_123",
      context_envelope: contextEnvelope,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(requestBody.context_envelope.ui.route).toBe("/lab/env/env_123/re/funds");
    expect(result.answer).toBe("IGF VII");
    expect(result.debug.resolvedScope).toMatchObject({
      environment_id: "env_123",
      business_id: "biz_123",
    });
    expect(result.debug.toolCalls[0]).toMatchObject({
      tool_name: "repe.get_environment_snapshot",
    });
    expect(result.debug.toolResults[0]).toMatchObject({
      tool_name: "repe.get_environment_snapshot",
      result: { fund_count: 1 },
    });
  });
});
