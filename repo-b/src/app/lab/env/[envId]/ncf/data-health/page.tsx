import NCFUnavailable from "@/components/ncf/NCFUnavailable";

export default function NCFDataHealthPage() {
  return (
    <NCFUnavailable
      title="Data trust &amp; health"
      note="Will surface freshness, scope coverage, and unresolved reconciliation exceptions for every metric shown elsewhere in the environment."
    />
  );
}
