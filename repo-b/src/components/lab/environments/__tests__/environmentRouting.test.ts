import { resolveEnvironmentOpenPath } from "@/components/lab/environments/constants";

describe("environment open routing", () => {
  test("routes real estate environments into REPE workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-1", industry: "real_estate" })).toBe("/lab/env/env-1/re");
    expect(resolveEnvironmentOpenPath({ envId: "env-1", industry: "real_estate_pe" })).toBe("/lab/env/env-1/re");
  });

  test("keeps non-RE environments in lab workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-9", industry: "healthcare" })).toBe("/lab/env/env-9");
  });

  test("routes PDS environments into PDS workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-2", industry: "pds_command" })).toBe("/lab/env/env-2/pds");
  });

  test("workspace template key overrides generic industry routing", () => {
    expect(
      resolveEnvironmentOpenPath({
        envId: "env-7",
        industry: "construction",
        industryType: "construction",
        workspaceTemplateKey: "pds_enterprise",
      })
    ).toBe("/lab/env/env-7/pds");
  });

  test("routes Credit environments into Credit workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-3", industry: "credit_risk_hub" })).toBe("/lab/env/env-3/credit");
  });

  test("routes Legal Ops environments into Legal workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-4", industry: "legal_ops_command" })).toBe("/lab/env/env-4/legal");
  });

  test("routes legacy legal environments into Legal workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-6", industry: "legal" })).toBe("/lab/env/env-6/legal");
  });

  test("routes Medical Office environments into Medical workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-5", industry: "medical_office_backoffice" })).toBe("/lab/env/env-5/medical");
  });

  test("routes Novendor Consulting OS environments", () => {
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "discovery_lab" })).toBe("/lab/env/e/discovery");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "data_studio" })).toBe("/lab/env/e/data-studio");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "workflow_intel" })).toBe("/lab/env/e/workflow-intel");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "vendor_intel" })).toBe("/lab/env/e/vendor-intel");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "metric_dict" })).toBe("/lab/env/e/metric-dict");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "data_chaos" })).toBe("/lab/env/e/data-chaos");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "exec_blueprint" })).toBe("/lab/env/e/blueprint");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "pilot_builder" })).toBe("/lab/env/e/pilot");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "impact_estimator" })).toBe("/lab/env/e/impact");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "case_factory" })).toBe("/lab/env/e/case-factory");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "ai_copilot" })).toBe("/lab/env/e/copilot");
    expect(resolveEnvironmentOpenPath({ envId: "e", industry: "engagement_output" })).toBe("/lab/env/e/outputs");
  });
});
