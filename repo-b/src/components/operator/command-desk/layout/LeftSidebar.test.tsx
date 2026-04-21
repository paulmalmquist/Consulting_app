import React from "react";
import { render, screen } from "@testing-library/react";
import { LeftSidebar } from "./LeftSidebar";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const sections = [
  {
    items: [
      { key: "pipeline", label: "Pipeline", href: "/a/pipeline" },
      { key: "accounting", label: "Accounting", href: "/a/accounting" },
    ],
  },
  {
    label: "WORK",
    items: [
      { key: "engagements", label: "Engagements", href: "/a/engagements" },
      { key: "tasks", label: "Tasks", href: "/a/tasks", disabled: true },
    ],
  },
];

describe("LeftSidebar", () => {
  it("renders all section items", () => {
    render(<LeftSidebar sections={sections} activeKey="pipeline" />);
    expect(screen.getByText(/Pipeline/)).toBeInTheDocument();
    expect(screen.getByText(/Accounting/)).toBeInTheDocument();
    expect(screen.getByText(/Engagements/)).toBeInTheDocument();
    expect(screen.getByText(/Tasks/)).toBeInTheDocument();
    expect(screen.getByText(/WORK/)).toBeInTheDocument();
  });

  it("wraps non-disabled items in links, but not disabled ones", () => {
    render(<LeftSidebar sections={sections} activeKey="pipeline" />);
    // Pipeline (enabled) is inside an <a>
    const pipe = screen.getByText(/Pipeline/).closest("a");
    expect(pipe).not.toBeNull();
    // Tasks (disabled) is NOT inside an <a>
    const tasks = screen.getByText(/Tasks/).closest("a");
    expect(tasks).toBeNull();
  });
});
