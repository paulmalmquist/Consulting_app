import FinanceLifecycleWorkspace from "@/components/finance/FinanceLifecycleWorkspace";

export default function FinanceDealsPage({ params }: { params: { deptKey: string } }) {
  return <FinanceLifecycleWorkspace deptKey={params.deptKey} section="deals" />;
}
