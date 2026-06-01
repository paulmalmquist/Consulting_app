import ReplayConsole from "@/components/telemetry/ReplayConsole";
import { PageHeader } from "@/components/telemetry/primitives";

export default function TelemetryReplayPage() {
  return (
    <>
      <PageHeader
        eyebrow="Replay test feed"
        title="Hot-fire replay → automated go/no-go"
        blurb="Replay a recorded test run in accelerated time. The promoted anomaly model scores each tick; when it detects off-nominal behavior the verdict flips on its own. Nothing here is hand-authored — the flag is the model's output."
      />
      <ReplayConsole />
    </>
  );
}
