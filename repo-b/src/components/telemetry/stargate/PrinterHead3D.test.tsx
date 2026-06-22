// The production defect this guards: a browser without WebGL made the R3F
// canvas throw at render, which escalated to the lab route error boundary and
// killed the whole Stargate console. jsdom has no WebGL either, so rendering
// the component here exercises exactly that browser path — it must degrade to
// the fallback panel, never throw.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrinterHead3D, { webglSupported } from "./PrinterHead3D";
import type { TelemetryPoint } from "@/lib/lab/stargateStream";

const POINT: TelemetryPoint = {
  printer_id: "stargate-v4-01",
  ts_us: 1_700_000_000_000_000,
  layer: 3,
  print_job_id: "JOB-00-0001-NORMAL",
  x: 120,
  y: 300,
  z: 2.4,
  melt_pool_temp_c: 1501.2,
  deposition_rate_kg_hr: 24.1,
  arm_vibration_g: 0.021,
};

function fakeCanvas(contexts: Record<string, unknown>): () => HTMLCanvasElement {
  return () =>
    ({
      getContext: (kind: string) => contexts[kind] ?? null,
    }) as unknown as HTMLCanvasElement;
}

describe("webglSupported", () => {
  it("is true when webgl2 is available", () => {
    expect(webglSupported(fakeCanvas({ webgl2: {} }))).toBe(true);
  });

  it("is true when only legacy webgl is available", () => {
    expect(webglSupported(fakeCanvas({ webgl: {} }))).toBe(true);
  });

  it("is false when no context is available", () => {
    expect(webglSupported(fakeCanvas({}))).toBe(false);
  });

  it("is false when context creation throws", () => {
    expect(
      webglSupported(() => {
        throw new Error("blocked");
      }),
    ).toBe(false);
  });

  it("is false in this jsdom environment (the production repro)", () => {
    expect(webglSupported()).toBe(false);
  });
});

describe("PrinterHead3D without WebGL", () => {
  it("renders the fallback panel instead of throwing to the route boundary", () => {
    expect(() => render(<PrinterHead3D points={[POINT]} />)).not.toThrow();
    const fallback = screen.getByTestId("printerhead-3d-fallback");
    expect(fallback.textContent).toContain("3D toolhead view unavailable");
    expect(fallback.textContent).toContain("does not support WebGL");
    expect(fallback.textContent).toContain("unaffected");
  });
});
