import FinanceLifecycleWorkspace from "@/components/finance/FinanceLifecycleWorkspace";

export default function FinanceAssetManagementPage({ params }: { params: { deptKey: string } }) {
  return <FinanceLifecycleWorkspace deptKey={params.deptKey} section="asset-management" />;
}
