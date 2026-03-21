import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function RelationshipHealthPage() {
  return (
    <PdsWorkspacePage
      title="Relationship Health"
      description="Track client relationship signals including satisfaction trends, engagement frequency, and risk indicators."
      defaultLens="account"
      defaultHorizon="YTD"
      sections={["satisfactionCloseout", "performance"]}
    />
  );
}
