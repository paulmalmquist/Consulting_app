import NCFUnavailable from "@/components/ncf/NCFUnavailable";

export default function NCFGrantsPage() {
  return (
    <NCFUnavailable
      title="Grant pipeline"
      lens="operational_reporting"
      note="Will track recommendation, qualification, approval, and distribution as distinct states so operational friction stays visible."
    />
  );
}
