import React from "react";
import { render, screen } from "@testing-library/react";

import { EnvironmentCard } from "@/components/lab/environments/EnvironmentCard";
import type { Environment } from "@/components/EnvProvider";

const baseEnv: Environment = {
  env_id: "a144a33c-bc53-41d3-b5c7-0ca4d31d88ad",
  client_name: "GreenRock",
  industry: "real_estate",
  industry_type: "real_estate",
  schema_name: "env_greenrock",
  is_active: true,
  created_at: "2026-02-19T00:00:00.000Z",
};

describe("EnvironmentCard", () => {
  test("renders mapped industry icons", () => {
    const { rerender } = render(
      <EnvironmentCard
        env={baseEnv}
        status="active"
        onOpen={() => {}}
        onSettings={() => {}}
        onArchive={() => {}}
      />
    );
    expect(screen.getByTestId("industry-icon-real_estate")).toBeInTheDocument();

    rerender(
      <EnvironmentCard
        env={{ ...baseEnv, industry: "healthcare", industry_type: "healthcare" }}
        status="active"
        onOpen={() => {}}
        onSettings={() => {}}
        onArchive={() => {}}
      />
    );
    expect(screen.getByTestId("industry-icon-healthcare")).toBeInTheDocument();

    rerender(
      <EnvironmentCard
        env={{ ...baseEnv, industry: "unknown", industry_type: "unknown" }}
        status="active"
        onOpen={() => {}}
        onSettings={() => {}}
        onArchive={() => {}}
      />
    );
    expect(screen.getByTestId("industry-icon-default")).toBeInTheDocument();
  });

  test("does not show environment id on card", () => {
    render(
      <EnvironmentCard
        env={baseEnv}
        status="active"
        onOpen={() => {}}
        onSettings={() => {}}
        onArchive={() => {}}
      />
    );
    expect(screen.queryByText(baseEnv.env_id)).not.toBeInTheDocument();
  });
});
