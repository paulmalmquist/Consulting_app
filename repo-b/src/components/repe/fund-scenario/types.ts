import type { FundBaseScenario, ModelScenario } from "@/lib/bos-api";
import type { ReModel } from "@/components/repe/model/types";

export type { FundBaseScenario, ReModel, ModelScenario };

export type FundScenarioTab =
  | "overview"
  | "waterfall"
  | "asset-drivers"
  | "cash-flows"
  | "debt-refi"
  | "valuation"
  | "jv-ownership"
  | "compare"
  | "audit"
  | "excel-sync";

export interface FundScenarioState {
  model: ReModel | null;
  scenarios: ModelScenario[];
  activeScenarioId: string | null;
  quarter: string;
  baseResult: FundBaseScenario | null;
  scenarioResult: FundBaseScenario | null;
  loading: boolean;
  error: string | null;
}
