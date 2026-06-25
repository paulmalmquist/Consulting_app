import { describe, expect, it } from "vitest";
import type { RegistryModel, RegistryVersion } from "@/lib/lab/factoryMlData";
import { RATIONALE_SOURCE, derivePromotionRationale } from "./factoryPromotionRationale";

function v(version: number, value: number, champion: boolean): RegistryVersion {
  return {
    version,
    stage: champion ? "champion" : "archived",
    is_champion: champion,
    primary_metric: "pr_auc",
    primary_metric_value: value,
    eval_metrics: { pr_auc: value },
    training_rows: 1000 * version,
    model_card_summary: null,
  };
}

const v4 = v(4, 0.84, true);
const model: RegistryModel = {
  model_key: "defect_risk",
  champion: v4,
  versions: [v(1, 0.795, false), v(2, 0.81, false), v(3, 0.825, false), v4],
};

describe("derivePromotionRationale", () => {
  it("explains why the champion is champion", () => {
    const r = derivePromotionRationale(model, v4);
    expect(r.whyChampion.length).toBeGreaterThan(0);
    expect(r.whyChampion.join(" ")).toMatch(/champion alias/i);
    expect(r.whyChampion.join(" ")).toMatch(/highest pr_auc/i);
    expect(r.whyNotChampion).toHaveLength(0);
  });

  it("explains why an archived version is not champion (lower metric + supersession)", () => {
    const r = derivePromotionRationale(model, model.versions[0]);
    const text = r.whyNotChampion.join(" ");
    expect(text).toMatch(/lower pr_auc/i);
    expect(text).toMatch(/superseded by champion v4/i);
    expect(r.whyChampion).toHaveLength(0);
  });

  it("always labels the derivation source", () => {
    expect(derivePromotionRationale(model, v4).source).toBe(RATIONALE_SOURCE);
  });
});
