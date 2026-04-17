import {
  CAPABILITY_STATES,
  CAPABILITY_STATE_META,
  CAPABILITY_STATE_TONE_CLASSES,
  capabilityStateMeta,
} from "./capability-state-taxonomy";

describe("capability-state-taxonomy", () => {
  test("exposes exactly the five approved states and nothing else", () => {
    expect([...CAPABILITY_STATES].sort()).toEqual([
      "archived",
      "experimental_partial",
      "not_enabled",
      "preview",
      "temporary_error",
    ]);
  });

  test("every state has complete meta (pill label, tone, headline, detail)", () => {
    for (const state of CAPABILITY_STATES) {
      const meta = capabilityStateMeta(state);
      expect(meta.pillLabel.length).toBeGreaterThan(0);
      expect(meta.defaultHeadline.length).toBeGreaterThan(0);
      expect(meta.defaultDetail.length).toBeGreaterThan(0);
      expect(CAPABILITY_STATE_TONE_CLASSES[meta.tone]).toBeDefined();
    }
  });

  test("pill copy matches the plan taxonomy table exactly", () => {
    expect(CAPABILITY_STATE_META.not_enabled.pillLabel).toBe("Not enabled in this environment");
    expect(CAPABILITY_STATE_META.preview.pillLabel).toBe("Preview — synthetic fixture data");
    expect(CAPABILITY_STATE_META.temporary_error.pillLabel).toBe("Temporarily unavailable");
    expect(CAPABILITY_STATE_META.experimental_partial.pillLabel).toBe("Experimental — partial capability");
    expect(CAPABILITY_STATE_META.archived.pillLabel).toBe("Archived");
  });
});
