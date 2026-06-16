/**
 * Regression guard — REPE dashboard widgets must surface a degraded authoritative
 * read as an explicit diagnostic empty-state, never a silent blank or zeroed widget.
 *
 * Context: follow-up to the repe_fast_path fix (PR #203, ADO #641). The fast path
 * now produces real data via the full pipeline, but the dashboard widgets fetched
 * statement endpoints and ignored null_reason / state_origin, so a degraded or
 * not-released read rendered blank. These tests lock the fix:
 *   - degraded null_reason  -> DiagnosticEmptyState (reason shown, no $0)
 *   - healthy released data  -> normal widget render (unchanged)
 *   - HTTP error             -> diagnostic, not blank
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import WidgetRenderer from "@/components/repe/dashboards/WidgetRenderer";

const ENV = "env-1";
const BIZ = "11111111-1111-1111-1111-111111111111";

function widget(overrides: Record<string, unknown> = {}) {
  return {
    id: "w1",
    type: "metrics_strip",
    config: {
      title: "Fund KPIs",
      entity_type: "investment",
      entity_ids: ["inv-1"],
      quarter: "2026Q2",
      metrics: [{ key: "noi", label: "NOI" }],
      ...overrides,
    },
    layout: { x: 0, y: 0, w: 4, h: 2 },
  } as never;
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WidgetRenderer degraded-state handling", () => {
  it("renders a diagnostic empty-state when the read carries a null_reason", async () => {
    mockFetchOnce({ lines: [], null_reason: "authoritative_state_not_released" });
    render(<WidgetRenderer widget={widget()} envId={ENV} businessId={BIZ} quarter="2026Q2" />);

    await waitFor(() => {
      expect(screen.getByText(/null_reason: authoritative_state_not_released/i)).toBeInTheDocument();
    });
    // Must NOT fabricate a zero value.
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(screen.getByText(/No authoritative data to display/i)).toBeInTheDocument();
  });

  it("renders a diagnostic empty-state on an HTTP error (not blank)", async () => {
    mockFetchOnce({}, false, 503);
    render(<WidgetRenderer widget={widget()} envId={ENV} businessId={BIZ} quarter="2026Q2" />);

    await waitFor(() => {
      expect(screen.getByText(/null_reason: data_unavailable/i)).toBeInTheDocument();
    });
  });

  it("flags a released-but-empty payload (zero lines) as no-data, not a blank shell", async () => {
    mockFetchOnce({ lines: [], state_origin: "authoritative" });
    render(<WidgetRenderer widget={widget()} envId={ENV} businessId={BIZ} quarter="2026Q2" />);

    await waitFor(() => {
      expect(screen.getByText(/null_reason: no_statement_data/i)).toBeInTheDocument();
    });
  });

  it("renders normally (no diagnostic) when authoritative data is present", async () => {
    mockFetchOnce({ lines: [{ line_code: "noi", amount: 1234000 }], state_origin: "authoritative" });
    render(<WidgetRenderer widget={widget()} envId={ENV} businessId={BIZ} quarter="2026Q2" />);

    // Healthy path: the diagnostic empty-state must NOT appear.
    await waitFor(() => {
      expect(screen.queryByText(/No authoritative data to display/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/null_reason:/i)).not.toBeInTheDocument();
  });
});
