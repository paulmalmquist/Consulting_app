import React from "react";
import { render, screen } from "@testing-library/react";
import EnvLifecyclePill, { deriveEnvLifecycleState } from "./EnvLifecyclePill";

describe("EnvLifecyclePill", () => {
  test("renders nothing when state is null", () => {
    const { container } = render(<EnvLifecyclePill state={null} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders archived pill with taxonomy copy", () => {
    render(<EnvLifecyclePill state="archived" />);
    const pill = screen.getByTestId("env-lifecycle-pill");
    expect(pill).toHaveAttribute("data-state", "archived");
    expect(pill.textContent).toBe("Archived");
  });

  test("renders experimental_partial pill with taxonomy copy", () => {
    render(<EnvLifecyclePill state="experimental_partial" />);
    const pill = screen.getByTestId("env-lifecycle-pill");
    expect(pill).toHaveAttribute("data-state", "experimental_partial");
    expect(pill.textContent).toBe("Experimental — partial capability");
  });

  test("renders preview pill with taxonomy copy", () => {
    render(<EnvLifecyclePill state="preview" />);
    const pill = screen.getByTestId("env-lifecycle-pill");
    expect(pill).toHaveAttribute("data-state", "preview");
    expect(pill.textContent).toBe("Preview — synthetic fixture data");
  });
});

describe("deriveEnvLifecycleState", () => {
  test("returns null for a fully-active env with no partial flags", () => {
    expect(
      deriveEnvLifecycleState({
        is_active: true,
        industry: "consulting",
      }),
    ).toBeNull();
  });

  test("archived takes precedence over any other flag when is_active is false", () => {
    expect(
      deriveEnvLifecycleState({
        is_active: false,
        industry: "repe",
        repe_initialized: false,
      }),
    ).toBe("archived");
  });

  test("REPE env with repe_initialized=false flags as experimental_partial", () => {
    expect(
      deriveEnvLifecycleState({
        is_active: true,
        industry: "repe",
        repe_initialized: false,
      }),
    ).toBe("experimental_partial");
  });

  test("REPE env with repe_initialized=true is active (null)", () => {
    expect(
      deriveEnvLifecycleState({
        is_active: true,
        industry: "repe",
        repe_initialized: true,
      }),
    ).toBeNull();
  });

  test("slug starting with demo- flags as preview", () => {
    expect(
      deriveEnvLifecycleState({
        is_active: true,
        slug: "demo-acme",
      }),
    ).toBe("preview");
  });
});
