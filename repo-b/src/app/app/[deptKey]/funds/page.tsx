import FinanceLifecycleWorkspace from "@/components/finance/FinanceLifecycleWorkspace";

export default function FinanceFundsPage({ params }: { params: { deptKey: string } }) {
  return <FinanceLifecycleWorkspace deptKey={params.deptKey} section="funds" />;
}
