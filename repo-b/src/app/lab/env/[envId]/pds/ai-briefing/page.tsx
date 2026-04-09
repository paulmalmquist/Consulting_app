import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsAiBriefingPage() {
  return (
    <PdsWorkspacePage
      title="Operating Posture"
      description="Answer one question only: are we in trouble? This page is intentionally sparse so a first-time buyer can orient in under 90 seconds."
      defaultLens="project"
      defaultHorizon="Forecast"
      sections={["operatingPosture", "briefing"]}
    />
  );
}
