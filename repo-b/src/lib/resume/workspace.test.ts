import { describe, expect, it } from "vitest";
import { makeResumeWorkspacePayload } from "@/test/fixtures/resumeWorkspace";
import {
  isValidEnvId,
  normalizeResumeWorkspace,
} from "@/lib/resume/workspace";

describe("normalizeResumeWorkspace", () => {
  it("preserves a complete payload without adding issues", () => {
    const result = normalizeResumeWorkspace(makeResumeWorkspacePayload());

    expect(result.issues).toEqual([]);
    expect(result.stats.roles).toBe(1);
    expect(result.stats.nodes).toBe(2);
    expect(result.workspace.identity.name).toBe("Paul Malmquist");
    expect(result.workspace.bi.root_entity_id).toBe("portfolio-root");
  });

  it("normalizes partial payloads with safe defaults", () => {
    const partial = {
      identity: {
        name: "Paul Malmquist",
      },
      timeline: {
        default_view: "not-a-real-view",
        roles: [],
        milestones: [],
      },
      architecture: {
        nodes: [],
        edges: [],
      },
      modeling: {},
      bi: {
        entities: [],
      },
      stories: [],
    };

    const result = normalizeResumeWorkspace(partial);

    expect(result.workspace.timeline.default_view).toBe("career");
    expect(result.workspace.modeling.presets[0]?.preset_id).toBe("base_case");
    expect(result.workspace.bi.entities[0]?.entity_id).toBe("portfolio-root");
    expect(result.workspace.stories).toHaveLength(4);
    expect(result.issues).toContain("timeline.roles missing or empty");
  });

  it("recovers from empty payloads", () => {
    const result = normalizeResumeWorkspace({});

    expect(result.workspace.identity.title).toContain("Systems Builder");
    expect(result.workspace.bi.root_entity_id).toBe("portfolio-root");
    expect(result.workspace.stories).toHaveLength(4);
    expect(result.issues).toContain("workspace payload missing or malformed");
  });

  it("recovers from malformed payloads", () => {
    const result = normalizeResumeWorkspace(null);

    expect(result.workspace.identity.name).toBe("Paul Malmquist");
    expect(result.workspace.architecture.nodes).toEqual([]);
    expect(result.workspace.stories).toHaveLength(4);
  });

  it("filters broken architecture edges and synthesizes missing stories", () => {
    const payload = makeResumeWorkspacePayload();
    payload.architecture.edges = [
      {
        edge_id: "broken-edge",
        source: "node-ui",
        target: "missing-node",
        technical_label: "Broken",
        impact_label: "Broken",
      },
    ];
    payload.stories = [];

    const result = normalizeResumeWorkspace(payload);

    expect(result.workspace.architecture.edges).toEqual([]);
    expect(result.workspace.stories).toHaveLength(4);
    expect(result.issues).toContain("architecture.edge filtered (broken-edge)");
    expect(result.issues.some((issue) => issue.includes("stories.timeline"))).toBe(true);
  });
});

describe("isValidEnvId", () => {
  it("accepts UUID environment ids and rejects malformed ids", () => {
    expect(isValidEnvId("7160a57b-59e7-4d72-bf43-5b9c179021af")).toBe(true);
    expect(isValidEnvId("env-resume")).toBe(false);
  });
});
