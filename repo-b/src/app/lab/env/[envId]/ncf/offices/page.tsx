import NCFUnavailable from "@/components/ncf/NCFUnavailable";

export default function NCFOfficesPage() {
  return (
    <NCFUnavailable
      title="Office performance rollup"
      lens="operational_reporting"
      note="Will preserve local context underneath any national rollup, so aggregated numbers remain drillable by office."
    />
  );
}
