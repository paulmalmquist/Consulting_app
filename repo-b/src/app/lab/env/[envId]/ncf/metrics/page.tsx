import NCFUnavailable from "@/components/ncf/NCFUnavailable";

export default function NCFMetricsPage() {
  return (
    <NCFUnavailable
      title="Governed metric catalog"
      note={"Will list every metric definition with its reporting lens, owner, source, and lineage notes \u2014 the single place a number is defined once and cited everywhere."}
    />
  );
}
