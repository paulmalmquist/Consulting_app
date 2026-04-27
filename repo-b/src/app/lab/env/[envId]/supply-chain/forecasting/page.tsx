import ForecastingPanel from "@/components/supply-chain/ForecastingPanel";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function ForecastingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Forecasting / ML"
        title="Models in production and pilot"
        blurb="Six practical use cases from demand forecasting to working-capital optimization. Each model card lists the feature set, retrain cadence, top SHAP drivers, and the caveats we tell the business."
      />
      <ForecastingPanel />
    </>
  );
}
