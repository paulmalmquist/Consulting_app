import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsAiBriefingPage() {
  return (
    <PdsWorkspacePage
      title="AI Briefing"
      description="Use the executive copilot to summarize what changed, where the business is at risk, and where leadership should intervene next."
      defaultLens="market"
      sections={["performance", "briefing", "forecast"]}
    />
  );
}
