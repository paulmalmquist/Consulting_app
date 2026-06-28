import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LaunchEventHero from "./LaunchEventHero";
import { EVENTS } from "./context/BottleneckMap/data";
import type { DecoratedEvent } from "./context/BottleneckMap/types";

// A resolved display event, exactly as the map surfaces it (real Sputnik data + the decoration the active
// color/size dimension adds). No invented values — everything is read from the typed event.
const sputnik = EVENTS.find((e) => e.id === "sputnik")!;
const event: DecoratedEvent = { ...sputnik, color: "#6CA8F0", dimLabel: "Mission achievement", sizeValue: sputnik.scale };

describe("LaunchEventHero", () => {
  it("renders the selected event as the hero: eyebrow, title, caption, KPIs, cards, and CTA", () => {
    render(<LaunchEventHero event={event} envId="env-test" onBack={() => {}} />);

    // Eyebrow = date · vehicle · dimension.
    expect(screen.getByText(/1957-10-04 · R-7 \/ Sputnik 8K71PS \(USSR\) · Mission achievement/)).toBeInTheDocument();
    // Title is the launch name (the leading word is isolated for the accent color; textContent is intact).
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sputnik 1");
    // Body is the event caption.
    expect(screen.getByText(/Orbit access itself is the achievement/)).toBeInTheDocument();

    // KPI cards (the node's own metrics).
    expect(screen.getByText("Payload")).toBeInTheDocument();
    expect(screen.getByText("83.6 kg")).toBeInTheDocument();
    expect(screen.getByText("Telemetry")).toBeInTheDocument();
    expect(screen.getByText("~2 analog channels")).toBeInTheDocument();
    expect(screen.getByText("Orbit lifetime")).toBeInTheDocument();
    expect(screen.getByText("92 days")).toBeInTheDocument();
    expect(screen.getByText("World launches that year")).toBeInTheDocument();

    // The four explanation cards.
    expect(screen.getByText("What changed · bottleneck solved")).toBeInTheDocument();
    expect(screen.getByText("Reaching orbit at all")).toBeInTheDocument();
    expect(screen.getByText("What got harder · operational question")).toBeInTheDocument();
    expect(screen.getByText("Doing anything useful once there")).toBeInTheDocument();
    expect(screen.getByText("New data that had to be trusted")).toBeInTheDocument();
    expect(screen.getByText("Doppler tracking as the first orbital data pipeline")).toBeInTheDocument();
    expect(screen.getByText("What this demo shows next")).toBeInTheDocument();

    // Forward framing + CTA to the page that proves the pattern next.
    expect(screen.getByText(/Once you have a signal, what do you do with it\?/)).toBeInTheDocument();
    expect(screen.getByText(/Mission Control/).closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/stream");
  });

  it("fails closed on the downstream CTA when envId is absent", () => {
    render(<LaunchEventHero event={event} envId="" onBack={() => {}} />);
    expect(screen.getByText(/downstream link unavailable/i)).toBeInTheDocument();
  });

  it("fires onBack from the Back to overview action", () => {
    const onBack = vi.fn();
    render(<LaunchEventHero event={event} envId="env-test" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
