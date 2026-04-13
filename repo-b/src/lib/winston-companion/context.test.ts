import { describe, expect, it } from "vitest";
import {
  buildCompanionContext,
  shouldRaiseWinstonLauncher,
  shouldShowWinstonCompanion,
} from "@/lib/winston-companion/context";
import type { AssistantContextEnvelope, ContextSnapshot } from "@/lib/commandbar/types";

function makeEnvelope(overrides: Partial<AssistantContextEnvelope> = {}): AssistantContextEnvelope {
  return {
    session: {
      org_id: "biz_1",
      roles: ["env_user"],
    },
    ui: {
      route: "/lab/env/env_1/re/funds/fund_1",
      surface: "fund_detail",
      active_module: "re",
      active_environment_id: "env_1",
      active_environment_name: "Meridian Capital Management",
      active_business_id: "biz_1",
      active_business_name: "Meridian Capital Management",
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
        assets: [
          {
            entity_type: "asset",
            entity_id: "asset_1",
            name: "Riverside Tower",
          },
        ],
      },
    },
    thread: {
      assistant_mode: "fund_copilot",
      scope_type: "fund",
      scope_id: "fund_1",
      launch_source: "winston_companion",
    },
    ...overrides,
  };
}

const snapshot: ContextSnapshot = {
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
};

describe("winston companion context", () => {
  it("suppresses the launcher on public and auth routes", () => {
    expect(shouldShowWinstonCompanion("/")).toBe(false);
    expect(shouldShowWinstonCompanion("/login")).toBe(false);
    expect(shouldShowWinstonCompanion("/public/report")).toBe(false);
    expect(shouldShowWinstonCompanion("/paul")).toBe(false);
    expect(shouldShowWinstonCompanion("/richard")).toBe(false);
    expect(shouldShowWinstonCompanion("/lab/env/env_1/re")).toBe(true);
  });

  it("raises the launcher over mobile nav routes", () => {
    expect(shouldRaiseWinstonLauncher("/lab/env/env_1/re")).toBe(true);
    expect(shouldRaiseWinstonLauncher("/lab/env/env_1/ecc")).toBe(true);
    expect(shouldRaiseWinstonLauncher("/lab/env/env_1/consulting")).toBe(true);
    expect(shouldRaiseWinstonLauncher("/app/winston")).toBe(false);
  });

  it("builds a grounded fund context with narrative and suggestions", () => {
    const context = buildCompanionContext({
      envelope: makeEnvelope(),
      snapshot,
    });

    expect(context.scopeKey).toBe("fund:fund_1");
    expect(context.scopeLabel).toBe("Institutional Growth Fund VII");
    expect(context.currentNarrative).toBe("Institutional Growth Fund VII");
    expect(context.quickLinks.some((item) => item.href.endsWith("/capital-calls"))).toBe(true);
    expect(context.suggestions.some((item) => item.prompt.includes("Institutional Growth Fund VII"))).toBe(true);
  });

  it("builds a grounded resume context with resume-specific quick links and suggestions", () => {
    const context = buildCompanionContext({
      envelope: makeEnvelope({
        ui: {
          route: "/lab/env/env_1/resume",
          surface: "resume_workspace",
          active_module: "resume",
          active_environment_id: "env_1",
          active_environment_name: "Meridian Capital Management",
          active_business_id: "biz_1",
          active_business_name: "Meridian Capital Management",
          page_entity_type: "environment",
          page_entity_id: "env_1",
          page_entity_name: "Paul Malmquist",
          selected_entities: [],
          visible_data: null,
        },
        thread: {
          assistant_mode: "resume_copilot",
          scope_type: "environment",
          scope_id: "env_1",
          launch_source: "winston_companion",
        },
      }),
      snapshot,
    });

    expect(context.routeLabel).toBe("Resume");
    expect(context.currentNarrative).toBe("Paul Malmquist");
    expect(context.quickLinks.some((item) => item.href.endsWith("/resume"))).toBe(true);
    expect(context.suggestions.some((item) => item.label.includes("Explain this resume"))).toBe(true);
  });
});
