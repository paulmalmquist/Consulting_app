import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

import { EpisodePromotionPanel } from "./EpisodePromotionPanel";

vi.mock("@/lib/historyrhymes/promotions", async (orig) => {
  const actual = await orig<typeof import("@/lib/historyrhymes/promotions")>();
  return {
    ...actual,
    validateEpisode: vi.fn(),
    createEpisode: vi.fn(),
    createEpisodeEmbedding: vi.fn(),
    sealPromotedEpisode: vi.fn(),
  };
});

import {
  createEpisode, createEpisodeEmbedding, sealPromotedEpisode, validateEpisode,
} from "@/lib/historyrhymes/promotions";

function candidate(over: Partial<PromotionCandidate> = {}): PromotionCandidate {
  return { candidate_id: "c1", approval_status: "approved", ...over };
}

const ok = (data: Record<string, unknown>) => ({ kind: "ok" as const, data: data as never });
const blocked = (reasons: string[]) => ({ kind: "blocked" as const, data: { status: "blocked" as const, blocked_reasons: reasons } });

beforeEach(() => vi.clearAllMocks());

describe("EpisodePromotionPanel", () => {
  it("gates on approval — non-approved shows the must-be-approved note", () => {
    render(<EpisodePromotionPanel candidate={candidate({ approval_status: "needs_review" })} />);
    expect(screen.getByText(/must be/i).textContent).toContain("approved");
    expect(screen.queryByTestId("episode-draft-panel")).toBeNull();
  });

  it("shows required episode fields for an approved candidate", () => {
    render(<EpisodePromotionPanel candidate={candidate()} />);
    expect(screen.getByTestId("episode-draft-panel")).toBeTruthy();
    expect(screen.getByLabelText("Macro conditions entering")).toBeTruthy();
    expect(screen.getByLabelText("Catalyst trigger")).toBeTruthy();
    expect(screen.getByLabelText("Timeline narrative")).toBeTruthy();
    expect(screen.getByTestId("searchability-badge").textContent).toContain("no episode yet");
  });

  it("create episode → searchable=false; embedding step appears separately", async () => {
    (createEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(ok({ episode_id: "ep-1", searchable: false }));
    render(<EpisodePromotionPanel candidate={candidate()} />);
    fireEvent.click(screen.getByTestId("action-create-episode"));
    await waitFor(() => expect(screen.getByTestId("searchability-badge").textContent).toContain("not searchable"));
    expect(createEpisode).toHaveBeenCalledWith("c1", expect.any(Object));
    // embedding action is now present and separate
    expect(screen.getByTestId("action-create-embedding")).toBeTruthy();
    // seal is disabled until embedding exists
    expect(screen.getByTestId("action-seal")).toBeDisabled();
  });

  it("create embedding flips searchable=true and enables seal", async () => {
    (createEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(ok({ episode_id: "ep-1" }));
    (createEpisodeEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(ok({ searchable: true }));
    render(<EpisodePromotionPanel candidate={candidate()} />);
    fireEvent.click(screen.getByTestId("action-create-episode"));
    await waitFor(() => screen.getByTestId("action-create-embedding"));
    fireEvent.click(screen.getByTestId("action-create-embedding"));
    await waitFor(() => expect(screen.getByTestId("searchability-badge").textContent).toBe("searchable"));
    expect(screen.getByTestId("action-seal")).not.toBeDisabled();
  });

  it("displays exact blocked reasons (no generic banner)", async () => {
    (createEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(blocked(["missing_timeline_narrative", "missing_catalyst_trigger"]));
    render(<EpisodePromotionPanel candidate={candidate()} />);
    fireEvent.click(screen.getByTestId("action-create-episode"));
    await waitFor(() => screen.getByTestId("episode-blocked-reasons"));
    const txt = screen.getByTestId("episode-blocked-reasons").textContent ?? "";
    expect(txt).toContain("missing_timeline_narrative");
    expect(txt).toContain("missing_catalyst_trigger");
    expect(txt).not.toContain("validation failed");
  });

  it("validate shows eligible without creating", async () => {
    (validateEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(ok({ status: "eligible" }));
    render(<EpisodePromotionPanel candidate={candidate()} />);
    fireEvent.click(screen.getByTestId("action-validate-episode"));
    await waitFor(() => screen.getByTestId("episode-eligible"));
    expect(createEpisode).not.toHaveBeenCalled();
  });

  it("seal is disabled before an embedding exists", async () => {
    (createEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(ok({ episode_id: "ep-1" }));
    render(<EpisodePromotionPanel candidate={candidate()} />);
    fireEvent.click(screen.getByTestId("action-create-episode"));
    await waitFor(() => screen.getByTestId("seal-panel"));
    expect(screen.getByTestId("action-seal")).toBeDisabled();
    expect(sealPromotedEpisode).not.toHaveBeenCalled();
  });

  it("no LLM / no Feature Foundry imports in the panel source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "EpisodePromotionPanel.tsx"), "utf-8").toLowerCase();
    expect(src).not.toContain("openai");
    expect(src).not.toContain("anthropic");
    expect(src).not.toContain("featurefoundry");
    expect(src).not.toContain("featurestore"); // promotion UI must not call the FF/feature-store client
    // it only talks to the promotion client
    expect(src).toContain("@/lib/historyrhymes/promotions");
  });
});
