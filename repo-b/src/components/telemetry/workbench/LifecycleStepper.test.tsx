import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LifecycleStepper } from "./LifecycleStepper";

vi.mock("next/navigation", () => ({
  useParams: () => ({ envId: "env-1" }),
}));

// Render next/link as a plain anchor so the test does not require the app-router context.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("LifecycleStepper", () => {
  it("renders all 15 lifecycle stages with env-scoped deep links", () => {
    render(<LifecycleStepper activeSlug="workbench" />);
    expect(screen.getByText("Raw telemetry")).toBeInTheDocument();
    expect(screen.getByText("Business decision")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(15);
    // model selection deep-links to the model-performance page under this env
    const modelSel = screen.getByText("Model selection").closest("a");
    expect(modelSel).toHaveAttribute("href", "/lab/env/env-1/telemetry/model-performance");
  });

  it("shows the honest status legend (live / computed / planned)", () => {
    render(<LifecycleStepper />);
    expect(screen.getByText("live")).toBeInTheDocument();
    expect(screen.getByText("computed artifact")).toBeInTheDocument();
    expect(screen.getByText("planned")).toBeInTheDocument();
  });
});
