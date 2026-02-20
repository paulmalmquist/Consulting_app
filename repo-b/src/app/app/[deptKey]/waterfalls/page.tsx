import FinanceLifecycleWorkspace from "@/components/finance/FinanceLifecycleWorkspace";

export default function FinanceWaterfallsPage({ params }: { params: { deptKey: string } }) {
  return <FinanceLifecycleWorkspace deptKey={params.deptKey} section="waterfalls" />;
}
