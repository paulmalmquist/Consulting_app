import { describe, it, expect } from "vitest";
import { cloudRunLink, cloudModelLink, cloudTableLink } from "./cloudLinks";

describe("cloudLinks — provider-aware deep links", () => {
  it("vertex run links to the Vertex console with the run id", () => {
    const l = cloudRunLink({ provider: "vertex", runId: "run-123", experimentId: "exp-9" });
    expect(l.href).toContain("console.cloud.google.com/vertex-ai/experiments");
    expect(l.href).toContain("run-123");
    expect(l.copyText).toBe("run-123");
  });

  it("databricks/null run falls back to the MLflow builder", () => {
    const l = cloudRunLink({ provider: "databricks", runId: "abc" });
    expect(l.label).toMatch(/MLflow/i);
    const l2 = cloudRunLink({ runId: "abc" }); // undefined provider → databricks path
    expect(l2.label).toMatch(/MLflow/i);
  });

  it("local_fixture run is copyable-only, never a dead external link", () => {
    const l = cloudRunLink({ provider: "local_fixture", runId: "seed-1" });
    expect(l.href).toBeNull();
    expect(l.copyText).toBe("seed-1");
    expect(l.unavailableReason).toMatch(/fixture/i);
  });

  it("vertex table links to BigQuery; missing id fails closed", () => {
    const l = cloudTableLink({ provider: "vertex", table: "novendor-events-prod.telemetry.gold_smap_msl_windows" });
    expect(l.href).toContain("bigquery");
    expect(l.href).toContain("gold_smap_msl_windows");
    const miss = cloudTableLink({ provider: "vertex", table: null });
    expect(miss.href).toBeNull();
    expect(miss.unavailableReason).toBeTruthy();
  });

  it("vertex model links to the Vertex model console", () => {
    const l = cloudModelLink({ provider: "vertex", modelId: "9988" });
    expect(l.href).toContain("vertex-ai/models");
    expect(l.href).toContain("9988");
  });
});
