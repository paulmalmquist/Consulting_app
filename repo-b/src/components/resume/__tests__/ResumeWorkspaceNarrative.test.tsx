import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumeWorkspace from "@/components/resume/ResumeWorkspace";
import { normalizeResumeWorkspace } from "@/lib/resume/workspace";
import { RESUME_BUSINESS_ID, RESUME_ENV_ID, makeResumeWorkspacePayload } from "@/test/fixtures/resumeWorkspace";

const mockRouterReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  usePathname: () => `/lab/env/${RESUME_ENV_ID}/resume`,
  useSearchParams: () => currentSearchParams,
}));

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantEnvironmentContext: vi.fn(),
  publishAssistantPageContext: vi.fn(),
  resetAssistantPageContext: vi.fn(),
}));

vi.mock("@/components/resume/ResumeArchitectureModule", () => ({
  default: () => <div data-testid="architecture-module">Architecture Module</div>,
}));

vi.mock("@/components/resume/ResumeModelingModule", () => ({
  default: () => <div data-testid="modeling-module">Modeling Module</div>,
}));

vi.mock("@/components/resume/ResumeBiModule", () => ({
  default: () => <div data-testid="bi-module">BI Module</div>,
}));

vi.mock("@/components/resume/ResumeAssistantDock", () => ({
  default: () => null,
}));

vi.mock("@/components/resume/ResumeModuleBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/resume/CompoundingCapabilityGraph", () => ({
  default: () => <div data-testid="timeline-graph">Timeline Graph</div>,
}));

function renderWorkspace() {
  const workspace = normalizeResumeWorkspace(makeResumeWorkspacePayload()).workspace;
  return render(
    <ResumeWorkspace
      envId={RESUME_ENV_ID}
      businessId={RESUME_BUSINESS_ID}
      workspace={workspace}
    />,
  );
}

describe("ResumeWorkspace narrative controls", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams();
    mockRouterReplace.mockReset();
  });

  it("hydrates selection from the URL and restores linked evidence", async () => {
    currentSearchParams = new URLSearchParams("view=impact&metric=properties_integrated");

    renderWorkspace();

    expect(await screen.findByText("Scale stops being a bullet point and becomes evidence of operating leverage.")).toBeInTheDocument();
    expect(screen.getByText("160+ hours/month recaptured and far fewer manual-entry errors.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Composite Impact" })).toBeInTheDocument();
  });

  it("links KPI cards to evidence, supports layer isolation, and clears selection", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: /Properties Integrated/i }));

    expect(await screen.findByText("Scale stops being a bullet point and becomes evidence of operating leverage.")).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenLastCalledWith(
      expect.stringContaining("metric=properties_integrated"),
      { scroll: false },
    );

    await user.click(screen.getByRole("button", { name: "Capability" }));
    await user.click(screen.getByRole("button", { name: /AI \/ Agentic Systems/i }));

    expect(await screen.findByText("Winston as a parallel proof point")).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenLastCalledWith(
      expect.stringContaining("layer=ai_agentic"),
      { scroll: false },
    );

    await user.click(screen.getByRole("button", { name: "Clear Selection" }));

    expect(await screen.findByText("Story Evidence")).toBeInTheDocument();
    expect(screen.queryByText("Winston as a parallel proof point")).not.toBeInTheDocument();
  });

  it("walks story controls in seeded order and falls back elegantly for sparse evidence", async () => {
    const user = userEvent.setup();
    currentSearchParams = new URLSearchParams("view=career&phase=phase-jll-2014-2018");

    renderWorkspace();

    expect(await screen.findByText("JLL (2014-2018)")).toBeInTheDocument();
    expect(screen.getByText("Select a timeline item to see evidence and metrics.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenLastCalledWith(
        expect.stringContaining("milestone=milestone-joined-jll-2014"),
        { scroll: false },
      ),
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenLastCalledWith(
        expect.stringContaining("milestone=milestone-expanded-bi-scope"),
        { scroll: false },
      ),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByText("Story Evidence")).toBeInTheDocument();
  });
});
