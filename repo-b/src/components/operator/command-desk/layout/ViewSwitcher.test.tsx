import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewSwitcher } from "./ViewSwitcher";

const views = [
  { key: "needs", label: "Needs Attention", count: 12, accent: "#FFB020" },
  { key: "txns",  label: "Transactions",    count: 60, accent: "#00E5FF" },
  { key: "recs",  label: "Receipts",        count: 40, accent: "#00E5FF" },
  { key: "invs",  label: "Invoices",        count: 15, accent: "#00E5FF" },
  { key: "subs",  label: "Subscriptions",   count: 7,  accent: "#FF2E9A" },
];

describe("ViewSwitcher", () => {
  it("renders each view tab with its count", () => {
    render(<ViewSwitcher views={views} value="needs" onChange={() => {}} />);
    expect(screen.getByText(/Needs Attention/i)).toBeInTheDocument();
    expect(screen.getByText(/Transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/Subscriptions/i)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("fires onChange when a tab is clicked", () => {
    const onChange = vi.fn();
    render(<ViewSwitcher views={views} value="needs" onChange={onChange} />);
    fireEvent.click(screen.getByText(/Subscriptions/i));
    expect(onChange).toHaveBeenCalledWith("subs");
  });
});
