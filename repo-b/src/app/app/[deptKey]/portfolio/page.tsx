import FinanceLifecycleWorkspace from "@/components/finance/FinanceLifecycleWorkspace";

export default function FinancePortfolioPage({ params }: { params: { deptKey: string } }) {
  return <FinanceLifecycleWorkspace deptKey={params.deptKey} section="portfolio" />;
}
