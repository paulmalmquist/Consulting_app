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
    currentSearchParams = new URLSearchParams("view=impact&milestone=milestone-500-property-automation");

    renderWorkspace();

    expect(await screen.findByText("Scale stops being a bullet point and becomes evidence of operating leverage.")).toBeInTheDocument();
    expect(screen.getByText("160+ hours/month recaptured and far fewer manual-entry errors.")).toBeInTheDocument();
  });

  it("clears narrative selection with Escape key", async () => {
    currentSearchParams = new URLSearchParams("view=career&milestone=milestone-kayne-warehouse-semantic");

    renderWorkspace();

    expect(await screen.findByText("DDQ turnaround became a platform outcome")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByText("DDQ turnaround became a platform outcome")).not.toBeInTheDocument(),
    );
  });

  it("renders hero metric strip and view mode tabs", async () => {
    renderWorkspace();

    expect(await screen.findByText("Build Journey")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Career" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capability" })).toBeInTheDocument();
    expect(screen.getByText("11+")).toBeInTheDocument();
    expect(screen.getByText("500+")).toBeInTheDocument();
    expect(screen.getByText("83")).toBeInTheDocument();
  });
});
