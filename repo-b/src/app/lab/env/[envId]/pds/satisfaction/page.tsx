import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsSatisfactionPage() {
  return (
    <PdsWorkspacePage
      title="Client Satisfaction"
      description="Track declining survey scores, repeat-award risk, and account-level experience issues before they become portfolio churn."
      defaultLens="account"
      sections={["performance", "satisfactionCloseout", "briefing"]}
    />
  );
}
