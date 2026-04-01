import React from "react";
import { render, screen } from "@testing-library/react";
import ResumePage from "@/app/lab/env/[envId]/resume/page";
import {
  RESUME_BUSINESS_ID,
  RESUME_ENV_ID,
} from "@/test/fixtures/resumeWorkspace";

const mockUseDomainEnv = vi.fn();
const mockResumeWorkspace = vi.fn();

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: (...args: unknown[]) => mockUseDomainEnv(...args),
}));

vi.mock("@/components/resume/ResumeWorkspace", () => ({
  default: (props: Record<string, unknown>) => {
    mockResumeWorkspace(props);
    const workspace = props.workspace as { identity: { title: string }; stories: unknown[] };
    return (
      <div data-testid="resume-workspace">
        <span>{workspace.identity.title}</span>
        <span data-testid="resume-story-count">{workspace.stories.length}</span>
      </div>
    );
  },
}));

describe("Resume route page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDomainEnv.mockReturnValue({
      envId: RESUME_ENV_ID,
      businessId: RESUME_BUSINESS_ID,
      loading: false,
      error: null,
      requestId: null,
      retry: vi.fn(),
    });
  });

  it("renders the seed workspace immediately with correct title", () => {
    render(<ResumePage />);

    expect(screen.getByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByText("AI Data Platform Architect — Investment Systems")).toBeInTheDocument();
  });

  it("includes all 4 stories from the seed", () => {
    render(<ResumePage />);

    expect(screen.getByTestId("resume-story-count")).toHaveTextContent("4");
  });

  it("renders with invalid env — seed always shows", () => {
    mockUseDomainEnv.mockReturnValue({
      envId: "not-a-valid-env",
      businessId: RESUME_BUSINESS_ID,
      loading: false,
      error: null,
      requestId: null,
      retry: vi.fn(),
    });

    render(<ResumePage />);

    expect(screen.getByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByText("AI Data Platform Architect — Investment Systems")).toBeInTheDocument();
  });

  it("renders with context loading — seed always shows", () => {
    mockUseDomainEnv.mockReturnValue({
      envId: RESUME_ENV_ID,
      businessId: null,
      loading: true,
      error: null,
      requestId: null,
      retry: vi.fn(),
    });

    render(<ResumePage />);

    expect(screen.getByTestId("resume-workspace")).toBeInTheDocument();
  });

  it("renders with context error — seed always shows", () => {
    mockUseDomainEnv.mockReturnValue({
      envId: RESUME_ENV_ID,
      businessId: RESUME_BUSINESS_ID,
      loading: false,
      error: "Something broke",
      requestId: "req_123",
      retry: vi.fn(),
    });

    render(<ResumePage />);

    expect(screen.getByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByText("AI Data Platform Architect — Investment Systems")).toBeInTheDocument();
  });

  it("passes envId and businessId to ResumeWorkspace", () => {
    render(<ResumePage />);

    expect(mockResumeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        envId: RESUME_ENV_ID,
        businessId: RESUME_BUSINESS_ID,
      }),
    );
  });
});
