import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import AiDispatchConsole from "@/components/ai-dispatch/AiDispatchConsole";

vi.mock("@/lib/ai-dispatch/api", () => ({
  getProviders: vi.fn(),
  getRuns: vi.fn(),
  getEvals: vi.fn(),
  getConfig: vi.fn(),
  setGemmaEnabled: vi.fn(),
}));

import { getProviders, getRuns, getEvals, getConfig, setGemmaEnabled } from "@/lib/ai-dispatch/api";

const mockProviders = getProviders as unknown as ReturnType<typeof vi.fn>;
const mockRuns = getRuns as unknown as ReturnType<typeof vi.fn>;
const mockEvals = getEvals as unknown as ReturnType<typeof vi.fn>;
const mockConfig = getConfig as unknown as ReturnType<typeof vi.fn>;
const mockSet = setGemmaEnabled as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

const PROVIDERS = {
  providers: [
    { name: "openai", display_name: "OpenAI", default_model: "gpt-5-mini", allowed_modes: ["code", "summarization"], max_risk: "high", max_privacy: "sensitive", fallback_allowed: true, implemented: true, available: true, missing_env: [] },
    { name: "anthropic", display_name: "Claude (Anthropic)", default_model: "claude-opus-4", allowed_modes: ["planning"], max_risk: "high", max_privacy: "sensitive", fallback_allowed: true, implemented: true, available: false, missing_env: ["ANTHROPIC_API_KEY"] },
    { name: "gemma_gcp", display_name: "Gemma (GCP Vertex)", default_model: "gemma-2", allowed_modes: ["summarization"], max_risk: "medium", max_privacy: "internal", fallback_allowed: false, implemented: false, available: false, missing_env: ["GEMMA_VERTEX_PROJECT_ID"] },
  ],
};

const EVALS = {
  suite: "routing_policy", total: 4, passed: 4, failed: 0,
  cases: [
    { name: "forced gemma + high-risk code is blocked on risk", mode: "code", risk: "high", expect_status: "blocked", expect_null_reason: "risk_tier_forbidden", got_status: "blocked", got_provider: null, got_null_reason: "risk_tier_forbidden", passed: true },
  ],
  note: "deterministic routing-policy checks via select_provider; no model calls, no receipts",
};

const CONFIG = { gemma_enabled: false, fallback_provider: "openai", fallback_model: "gpt-5-mini", execution_enabled: true };

function mountAll() {
  mockProviders.mockResolvedValue(PROVIDERS);
  mockEvals.mockResolvedValue(EVALS);
  mockRuns.mockResolvedValue({ runs: [], count: 0 });
  mockConfig.mockResolvedValue(CONFIG);
}

describe("AiDispatchConsole", () => {
  it("renders provider inventory, honesty banner, eval summary, empty runs, and the Gemma toggle", async () => {
    mountAll();
    render(<AiDispatchConsole />);

    await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument());
    expect(screen.getByText("available")).toBeInTheDocument();
    expect(screen.getByText("not configured")).toBeInTheDocument();
    expect(screen.getByText("fail-closed")).toBeInTheDocument();
    expect(screen.getByText(/Available now/i)).toBeInTheDocument();
    expect(screen.getByText("4/4 pass")).toBeInTheDocument();
    expect(screen.getByText(/No governed dispatch runs yet/i)).toBeInTheDocument();
    // Toggle + fallback disclosure
    await waitFor(() => expect(screen.getByText(/Gemma: OFF/i)).toBeInTheDocument());
    expect(screen.getByText(/recorded as a\s*fallback, never silent/i)).toBeInTheDocument();
    expect(screen.getAllByText("gpt-5-mini").length).toBeGreaterThan(0);
  });

  it("the only control is the Gemma toggle, and clicking it flips Gemma on", async () => {
    mountAll();
    mockSet.mockResolvedValue({ ...CONFIG, gemma_enabled: true });
    render(<AiDispatchConsole />);

    await waitFor(() => expect(screen.getByText(/Gemma: OFF/i)).toBeInTheDocument());
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1); // only the toggle — UI still cannot trigger /run
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(screen.getByText(/Gemma: ON/i)).toBeInTheDocument());
    expect(mockSet).toHaveBeenCalledWith(true);
  });

  it("surfaces a load error without crashing", async () => {
    mockProviders.mockRejectedValue(new Error("boom (req: x)"));
    mockEvals.mockResolvedValue(EVALS);
    mockRuns.mockResolvedValue({ runs: [], count: 0 });
    mockConfig.mockResolvedValue(CONFIG);
    render(<AiDispatchConsole />);
    await waitFor(() => expect(screen.getByText(/Could not load: boom/i)).toBeInTheDocument());
  });
});
