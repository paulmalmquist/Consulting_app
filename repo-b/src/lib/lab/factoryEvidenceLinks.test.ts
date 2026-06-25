import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deltaTableLink,
  mlflowExperimentLink,
  mlflowRunLink,
  registeredModelLink,
} from "./factoryEvidenceLinks";

const ORIGINAL = process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL;
  else process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL = ORIGINAL;
});

describe("factoryEvidenceLinks — live by default", () => {
  beforeEach(() => {
    // Unset override so the committed default workspace is used.
    delete process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL;
  });

  it("builds a live MLflow run deep link in the confirmed <ws>/?o=<org>#mlflow/... format", () => {
    const link = mlflowRunLink("9c25866d78184746a2a0ae28526009bf");
    expect(link.href).toBe(
      "https://dbc-2504bec5-b5ab.cloud.databricks.com/?o=7474657239253594" +
        "#mlflow/experiments/3740651530987773/runs/9c25866d78184746a2a0ae28526009bf",
    );
    expect(link.unavailableReason).toBeUndefined();
    expect(link.copyText).toBe("9c25866d78184746a2a0ae28526009bf");
  });

  it("builds a live experiment link", () => {
    const link = mlflowExperimentLink("/Users/x/RSFactoryML");
    expect(link.href).toContain("#mlflow/experiments/3740651530987773");
  });

  it("builds a UC model link from a fully-qualified name", () => {
    const link = registeredModelLink("novendor_1.rs_factory.rs_print_passfail");
    expect(link.href).toContain("/explore/data/models/novendor_1/rs_factory/rs_print_passfail");
  });

  it("respects the NEXT_PUBLIC override", () => {
    process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL = "https://example.cloud.databricks.com/";
    const link = mlflowRunLink("abc");
    expect(link.href).toContain("https://example.cloud.databricks.com/?o=");
    expect(link.href).not.toContain("dbc-2504bec5");
  });
});

describe("factoryEvidenceLinks — fail closed", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL;
  });

  it("missing runId returns href null + reason even when workspace is configured", () => {
    const link = mlflowRunLink(undefined);
    expect(link.href).toBeNull();
    expect(link.unavailableReason).toMatch(/no mlflow run id/i);
  });

  it("missing model name returns href null + reason", () => {
    const link = registeredModelLink(undefined);
    expect(link.href).toBeNull();
    expect(link.unavailableReason).toMatch(/no registered model name/i);
  });

  it("a bare seed model key (not a UC path) is disabled with a reason + copyable id", () => {
    const link = registeredModelLink("defect_risk");
    expect(link.href).toBeNull();
    expect(link.unavailableReason).toMatch(/unity catalog/i);
    expect(link.copyText).toBe("defect_risk");
  });

  it("a non-UC table name is disabled with a reason", () => {
    const link = deltaTableLink("bronze_raw_qms_ncrs");
    expect(link.href).toBeNull();
    expect(link.unavailableReason).toMatch(/unity catalog/i);
  });
});
