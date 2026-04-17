import React from "react";
import { render, screen } from "@testing-library/react";
import { HistoryRhymesDataStateBanner } from "./HistoryRhymesDataStateBanner";

describe("HistoryRhymesDataStateBanner", () => {
  test("preview state renders PREVIEW eyebrow with synthetic-data copy", () => {
    render(<HistoryRhymesDataStateBanner state="preview" />);
    const banner = screen.getByTestId("history-rhymes-data-state-banner");
    expect(banner).toHaveAttribute("data-state", "preview");
    expect(banner.textContent).toContain("PREVIEW");
    expect(banner.textContent).toContain("Synthetic fixture data");
    expect(banner.textContent).toContain("None of the numbers below are real");
  });

  test("seeded state renders SEEDED eyebrow with episode count and not-live qualifier", () => {
    render(<HistoryRhymesDataStateBanner state="seeded" episodeCount={8} />);
    const banner = screen.getByTestId("history-rhymes-data-state-banner");
    expect(banner).toHaveAttribute("data-state", "seeded");
    expect(banner.textContent).toContain("SEEDED");
    expect(banner.textContent).toContain("8 seeded episodes");
    expect(banner.textContent).toContain("Not a live current-market match");
  });

  test("seeded state uses singular 'episode' for count of 1", () => {
    render(<HistoryRhymesDataStateBanner state="seeded" episodeCount={1} />);
    expect(screen.getByTestId("history-rhymes-data-state-banner").textContent).toContain(
      "1 seeded episode.",
    );
  });

  test("live state renders LIVE eyebrow (reserved — only valid via T3.1 pipeline)", () => {
    render(<HistoryRhymesDataStateBanner state="live" />);
    const banner = screen.getByTestId("history-rhymes-data-state-banner");
    expect(banner).toHaveAttribute("data-state", "live");
    expect(banner.textContent).toContain("LIVE");
    expect(banner.textContent).toContain("computed from live inputs");
  });

  test("errorNote is surfaced when provided", () => {
    render(
      <HistoryRhymesDataStateBanner state="preview" errorNote="Request failed (503)" />,
    );
    expect(screen.getByTestId("history-rhymes-data-state-error-note").textContent).toContain(
      "Request failed (503)",
    );
  });

  test("errorNote is not rendered when null", () => {
    render(<HistoryRhymesDataStateBanner state="preview" errorNote={null} />);
    expect(screen.queryByTestId("history-rhymes-data-state-error-note")).toBeNull();
  });
});
