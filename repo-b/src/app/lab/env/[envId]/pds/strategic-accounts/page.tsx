import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function StrategicAccountsPage() {
  return (
    <PdsWorkspacePage
      title="Strategic Accounts"
      description="Monitor high-value account performance, relationship depth, and growth trajectory."
      defaultLens="account"
      defaultHorizon="YTD"
      sections={["performance", "satisfactionCloseout", "forecast"]}
    />
  );
}
