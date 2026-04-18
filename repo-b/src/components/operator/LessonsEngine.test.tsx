import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LessonsEngine } from "./LessonsEngine";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorLessons: vi.fn(),
}));

import { getOperatorLessons } from "@/lib/bos-api";

const MOCK = {
  rows: [
    {
      id: "ls-001",
      project_id: "hist-tower-b",
      project_name: "Tower B — 2025",
      municipality_id: "muni-dallas",
      theme: "electrical_panel_sizing",
      severity: "high" as const,
      lesson: "Panel sizing narrative must include full load calc with design margin.",
      preemptive_action: "Submit signed load-calc narrative with first submission.",
      applies_to_active_work: true,
      municipality_is_active: true,
      relevance_score: 3,
    },
    {
      id: "ls-006",
      project_id: "hist-denver-hub",
      project_name: "Denver Hub — 2024",
      municipality_id: "muni-denver",
      theme: "ada_clearance",
      severity: "medium" as const,
      lesson: "ADA door clearance at TI reveals is the most common first-cycle comment.",
      preemptive_action: "Include door-clearance sheet in TI submission as a standard item.",
      applies_to_active_work: false,
      municipality_is_active: false,
      relevance_score: 0,
    },
  ],
  totals: { lesson_count: 2, applies_count: 1, active_theme_count: 1 },
};

describe("LessonsEngine", () => {
  beforeEach(() => {
    (getOperatorLessons as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline announces applicable lessons count", async () => {
    (getOperatorLessons as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<LessonsEngine />);
    await waitFor(() => {
      const h = screen.getByTestId("lessons-headline");
      expect(h.textContent).toMatch(/1 of 2 lessons/);
    });
  });

  it("renders lesson cards with preemptive action", async () => {
    (getOperatorLessons as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<LessonsEngine />);
    await waitFor(() => {
      const card = screen.getByTestId("lesson-ls-001");
      expect(card.textContent).toMatch(/Panel sizing narrative/);
      expect(card.textContent).toMatch(/Preemptive action/);
      expect(card.textContent).toMatch(/load-calc narrative/);
    });
  });

  it("high severity pill renders in red", async () => {
    (getOperatorLessons as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<LessonsEngine />);
    await waitFor(() => {
      const pill = screen.getByTestId("lesson-severity-ls-001");
      expect(pill.textContent).toMatch(/high/i);
      expect(pill.className).toContain("red");
    });
  });

  it("splits applies-to-active from reference library", async () => {
    (getOperatorLessons as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<LessonsEngine />);
    await waitFor(() => {
      expect(screen.getByText(/Applies to active work/i)).toBeTruthy();
      expect(screen.getByText(/Reference library/i)).toBeTruthy();
    });
  });
});
