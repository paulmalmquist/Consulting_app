import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import PipelinePage from "@/app/lab/env/[envId]/pds/pipeline/page";

const mockUseDomainEnv = vi.fn();
const mockGetPdsPipeline = vi.fn();
const mockGetPdsPipelineLookups = vi.fn();
const mockGetPdsPipelineDeal = vi.fn();
const mockCreatePdsPipelineDeal = vi.fn();
const mockUpdatePdsPipelineDeal = vi.fn();

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: (...args: unknown[]) => mockUseDomainEnv(...args),
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    getPdsPipeline: (...args: unknown[]) => mockGetPdsPipeline(...args),
    getPdsPipelineLookups: (...args: unknown[]) => mockGetPdsPipelineLookups(...args),
    getPdsPipelineDeal: (...args: unknown[]) => mockGetPdsPipelineDeal(...args),
    createPdsPipelineDeal: (...args: unknown[]) => mockCreatePdsPipelineDeal(...args),
    updatePdsPipelineDeal: (...args: unknown[]) => mockUpdatePdsPipelineDeal(...args),
  };
});

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PointerSensor: class PointerSensor {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false,
  }),
  useDroppable: () => ({
    setNodeRef: () => {},
    isOver: false,
  }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Bar: () => null,
}));

describe("PDS pipeline page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDomainEnv.mockReturnValue({
      envId: "env-stonepds",
      businessId: "biz-stonepds",
    });
    mockGetPdsPipelineLookups.mockResolvedValue({ accounts: [], owners: [], stages: [] });
    mockGetPdsPipelineDeal.mockResolvedValue({ deal: null, history: [] });
    mockCreatePdsPipelineDeal.mockResolvedValue(null);
    mockUpdatePdsPipelineDeal.mockResolvedValue(null);
  });

  test("shows onboarding when the pipeline is empty", async () => {
    mockGetPdsPipeline.mockResolvedValue({
      has_deals: false,
      empty_state_title: "No pipeline yet",
      empty_state_body: "Create the first deal.",
      required_fields: ["Deal", "Account", "Stage", "Value", "Probability", "Expected Close", "Owner"],
      example_deal: {
        deal_name: "Northwest Medical Campus Refresh",
        account_name: "Stone Strategic Accounts",
        stage: "prospect",
        deal_value: 1200000,
        probability_pct: 25,
        owner_name: "Dana Park",
      },
      metrics: [],
      attention_items: [],
      stages: [],
      timeline: [],
      deals: [],
      total_pipeline_value: 0,
      total_weighted_value: 0,
    });

    render(<PipelinePage />);

    expect(await screen.findByText("No pipeline yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create First Deal/i })).toBeInTheDocument();
    expect(screen.getByText("Example Deal")).toBeInTheDocument();
    expect(screen.queryByText("All Pipeline Deals")).not.toBeInTheDocument();
  });

  test("renders the board-first workspace when deals exist", async () => {
    mockGetPdsPipeline.mockResolvedValue({
      has_deals: true,
      empty_state_title: "No pipeline yet",
      empty_state_body: "Create the first deal.",
      required_fields: [],
      example_deal: null,
      metrics: [
        {
          key: "total_pipeline",
          label: "Total Pipeline",
          value: 8100000,
          delta_value: 250000,
          delta_label: "vs prior snapshot",
          tone: "neutral",
          context: "Open value across prospect to won.",
          empty_hint: null,
        },
      ],
      attention_items: [
        {
          deal_id: "deal-1",
          deal_name: "Petron Refinery Controls Upgrade",
          account_name: "Stone Strategic Accounts",
          stage: "negotiation",
          deal_value: 4500000,
          probability_pct: 55,
          expected_close_date: "2026-04-18",
          issue_type: "closing_soon",
          issue: "Expected close is within 30 days.",
          action: "Confirm the close plan and owner commitments.",
          tone: "warn",
        },
      ],
      stages: [
        {
          stage: "negotiation",
          label: "Negotiation",
          count: 1,
          weighted_value: 2475000,
          unweighted_value: 4500000,
          avg_days_in_stage: 9,
          conversion_to_next_pct: 50,
          dropoff_pct: null,
          tone: "warn",
        },
        {
          stage: "won",
          label: "Won",
          count: 1,
          weighted_value: 4100000,
          unweighted_value: 4100000,
          avg_days_in_stage: 6,
          conversion_to_next_pct: null,
          dropoff_pct: null,
          tone: "positive",
        },
      ],
      timeline: [
        {
          forecast_month: "2026-04-01",
          unweighted_value: 4500000,
          weighted_value: 2475000,
          deal_count: 1,
        },
      ],
      deals: [
        {
          deal_id: "deal-1",
          deal_name: "Petron Refinery Controls Upgrade",
          account_id: "acct-1",
          account_name: "Stone Strategic Accounts",
          stage: "negotiation",
          deal_value: 4500000,
          probability_pct: 55,
          expected_close_date: "2026-04-18",
          owner_name: "Riley Brooks",
          notes: "Awaiting final commercial sign-off.",
          lost_reason: null,
          stage_entered_at: "2026-03-10T12:00:00Z",
          last_activity_at: "2026-03-20T12:00:00Z",
          days_in_stage: 13,
          days_to_close: 26,
          health_state: "warn",
          attention_reasons: ["closing_soon"],
          is_closed: false,
        },
      ],
      total_pipeline_value: 8100000,
      total_weighted_value: 4300000,
    });

    render(<PipelinePage />);

    await waitFor(() => expect(mockGetPdsPipeline).toHaveBeenCalled());
    expect(await screen.findByText("Deals in Motion")).toBeInTheDocument();
    expect(screen.getByText("Deals Requiring Attention")).toBeInTheDocument();
    expect(screen.getByText("Close Timeline")).toBeInTheDocument();
    expect(screen.getAllByText("Petron Refinery Controls Upgrade").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("All Pipeline Deals")).toBeInTheDocument();
  });
});
