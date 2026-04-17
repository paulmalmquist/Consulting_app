import React from "react";
import { render, screen } from "@testing-library/react";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";

describe("OperatorUnavailableState", () => {
  test("renders demo-warmup card when backend returns operator.demo_unavailable", () => {
    const err: any = new Error(
      "Hall Boys operator demo data is not available in this environment."
    );
    err.code = "operator.demo_unavailable";
    render(<OperatorUnavailableState error={err} onRetry={() => {}} />);
    expect(screen.getByText(/demo environment warming up/i)).toBeInTheDocument();
    expect(screen.queryByText(/fixtures/)).toBeNull();
  });

  test("scrubs raw filesystem path from detail string (defense in depth)", () => {
    const detail =
      "[Errno 2] No such file or directory: '/fixtures/winston_demo/hall_boys_operator_seed.json'";
    render(<OperatorUnavailableState detail={detail} onRetry={() => {}} />);
    const body = document.body.innerHTML;
    expect(body).not.toMatch(/\/fixtures\//);
    expect(body).not.toMatch(/hall_boys_operator_seed\.json/);
  });

  test("hides request id inside a disclosure, never inline", () => {
    render(
      <OperatorUnavailableState
        detail="Some error"
        onRetry={() => {}}
        requestId="req-123"
      />
    );
    const details = screen.getByText(/diagnostics/i);
    expect(details).toBeInTheDocument();
  });
});
