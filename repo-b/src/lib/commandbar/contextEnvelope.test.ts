import { afterEach, describe, expect, it } from "vitest";
import { buildAssistantContextEnvelope } from "@/lib/commandbar/contextEnvelope";

describe("buildAssistantContextEnvelope", () => {
  afterEach(() => {
    delete window.__APP_CONTEXT__;
    document.cookie = "bos_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("merges environment, route, and visible page data into the envelope", () => {
    document.cookie = `bos_session=${encodeURIComponent(JSON.stringify({ role: "env_user", env_id: "env_123" }))}; path=/`;
    window.__APP_CONTEXT__ = {
      environment: {
        active_environment_id: "env_123",
        active_environment_name: "Meridian Capital Management",
        active_business_id: "biz_123",
        schema_name: "env_meridian_capital",
        industry: "repe",
      },
      page: {
        route: "/lab/env/env_123/re/funds",
        surface: "fund_portfolio",
        active_module: "re",
        page_entity_type: "environment",
        page_entity_id: "env_123",
        selected_entities: [],
        visible_data: {
          funds: [{ entity_type: "fund", entity_id: "fund_1", name: "IGF VII" }],
        },
      },
      updated_at: Date.now(),
    };

    const envelope = buildAssistantContextEnvelope({
      context: { route: "/lab/env/env_123/re/funds" },
      snapshot: {
        route: "/lab/env/env_123/re/funds",
        environments: [],
        selectedEnv: {
          env_id: "env_123",
          client_name: "Meridian Capital Management",
          schema_name: "env_meridian_capital",
          business_id: "biz_123",
        },
        business: {
          business_id: "biz_123",
          name: "Meridian Capital Management",
        },
        modulesAvailable: ["re"],
        recentRuns: [],
      },
      conversationId: "thread_123",
      launchSource: "winston_modal",
    });

    expect(envelope.ui.active_environment_id).toBe("env_123");
    expect(envelope.ui.active_business_id).toBe("biz_123");
    expect(envelope.ui.schema_name).toBe("env_meridian_capital");
    expect(envelope.ui.surface).toBe("fund_portfolio");
    expect(envelope.thread.thread_id).toBe("thread_123");
    expect(envelope.thread.scope_type).toBe("environment");
    expect(envelope.ui.visible_data?.funds?.[0]?.name).toBe("IGF VII");
  });

  it("treats fund detail routes as fund-scoped pages", () => {
    window.__APP_CONTEXT__ = {
      environment: {
        active_environment_id: "env_123",
        active_business_id: "biz_123",
      },
      page: {
        route: "/lab/env/env_123/re/funds/fund_99",
        page_entity_type: "fund",
        page_entity_id: "fund_99",
        page_entity_name: "IGF VII",
        selected_entities: [],
        visible_data: null,
      },
      updated_at: Date.now(),
    };

    const envelope = buildAssistantContextEnvelope({
      context: { route: "/lab/env/env_123/re/funds/fund_99" },
      snapshot: null,
    });

    expect(envelope.ui.page_entity_type).toBe("fund");
    expect(envelope.thread.scope_type).toBe("fund");
    expect(envelope.thread.scope_id).toBe("fund_99");
    expect(envelope.ui.selected_entities[0]).toMatchObject({
      entity_type: "fund",
      entity_id: "fund_99",
      name: "IGF VII",
    });
  });

  it("maps the supported RE overview launch surface to environment scope", () => {
    const envelope = buildAssistantContextEnvelope({
      context: {
        route: "/lab/env/env_123/re",
        currentEnvId: "env_123",
        currentBusinessId: "biz_123",
      },
      snapshot: null,
    });

    expect(envelope.ui.surface).toBe("re_workspace");
    expect(envelope.ui.active_module).toBe("re");
    expect(envelope.thread.scope_type).toBe("environment");
    expect(envelope.thread.scope_id).toBe("env_123");
  });

  it("recognizes the resume route as a dedicated resume workspace surface", () => {
    const envelope = buildAssistantContextEnvelope({
      context: {
        route: "/lab/env/7160a57b-59e7-4d72-bf43-5b9c179021af/resume",
        currentEnvId: "7160a57b-59e7-4d72-bf43-5b9c179021af",
      },
      snapshot: null,
    });

    expect(envelope.ui.surface).toBe("resume_workspace");
    expect(envelope.ui.active_module).toBe("resume");
    expect(envelope.ui.page_entity_type).toBe("environment");
    expect(envelope.ui.page_entity_id).toBe("7160a57b-59e7-4d72-bf43-5b9c179021af");
  });
});
