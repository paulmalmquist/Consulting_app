import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResumePage from "@/app/lab/env/[envId]/resume/page";
import {
  makeResumeWorkspacePayload,
  RESUME_BUSINESS_ID,
  RESUME_ENV_ID,
} from "@/test/fixtures/resumeWorkspace";

const mockUseDomainEnv = vi.fn();
const mockGetResumeWorkspace = vi.fn();
const mockResumeWorkspace = vi.fn();
const mockRetry = vi.fn();
const mockLogError = vi.fn();
const mockLogInfo = vi.fn();
const mockLogWarn = vi.fn();

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: (...args: unknown[]) => mockUseDomainEnv(...args),
}));

vi.mock("@/lib/bos-api", () => ({
  getResumeWorkspace: (...args: unknown[]) => mockGetResumeWorkspace(...args),
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

vi.mock("@/lib/logging/logger", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logWarn: (...args: unknown[]) => mockLogWarn(...args),
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
      retry: mockRetry,
    });
  });

  it("renders the workspace with full data", async () => {
    mockGetResumeWorkspace.mockResolvedValue(makeResumeWorkspacePayload());

    render(<ResumePage />);

    await waitFor(() =>
      expect(mockGetResumeWorkspace).toHaveBeenCalledWith(RESUME_ENV_ID, RESUME_BUSINESS_ID),
    );
    expect(await screen.findByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByText("Systems Builder and Product Operator")).toBeInTheDocument();
  });

  it("renders the workspace with sparse data after normalization", async () => {
    mockGetResumeWorkspace.mockResolvedValue({
      identity: {
        name: "Paul Malmquist",
      },
      timeline: {
        roles: [],
        milestones: [],
      },
      architecture: {
        nodes: [],
        edges: [],
      },
      modeling: {},
      bi: {
        entities: [],
      },
      stories: [],
    });

    render(<ResumePage />);

    expect(await screen.findByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("resume-story-count")).toHaveTextContent("4");
    expect(mockLogWarn).toHaveBeenCalled();
  });

  it("renders the workspace with an empty payload instead of crashing", async () => {
    mockGetResumeWorkspace.mockResolvedValue({});

    render(<ResumePage />);

    expect(await screen.findByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByText("Systems Builder and Product Operator")).toBeInTheDocument();
  });

  it("renders the workspace with malformed payloads instead of crashing", async () => {
    mockGetResumeWorkspace.mockResolvedValue(null);

    render(<ResumePage />);

    expect(await screen.findByTestId("resume-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("resume-story-count")).toHaveTextContent("4");
  });

  it("shows a clean invalid env state without fetching", () => {
    mockUseDomainEnv.mockReturnValue({
      envId: "not-a-valid-env",
      businessId: RESUME_BUSINESS_ID,
      loading: false,
      error: null,
      requestId: null,
      retry: mockRetry,
    });

    render(<ResumePage />);

    expect(screen.getByText(/valid environment id/i)).toBeInTheDocument();
    expect(mockGetResumeWorkspace).not.toHaveBeenCalled();
  });

  it("shows an attributable error state and retries failed loads", async () => {
    mockGetResumeWorkspace.mockRejectedValue(
      Object.assign(new Error("Resume workspace unavailable"), { requestId: "req_resume_123" }),
    );

    render(<ResumePage />);

    expect(await screen.findByText("Resume data unavailable")).toBeInTheDocument();
    expect(screen.getByText(/req_resume_123/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry visual resume/i }));

    await waitFor(() => expect(mockGetResumeWorkspace).toHaveBeenCalledTimes(2));
  });
});
