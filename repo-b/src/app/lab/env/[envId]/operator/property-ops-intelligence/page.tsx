import Link from "next/link";
import { PropertyOpsIntelligencePage } from "@/components/operator/property-ops/PropertyOpsIntelligencePage";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function OperatorPropertyOpsIntelligenceRoute({ params }: Props) {
  const { envId } = await params;
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4 text-[#25145F]">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-[#4025A8]">Winston implementation view</div>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#514574]">
          This route shows the HappyCo proof wired into the Winston operator surface. For the clean external presentation, use{" "}
          <Link href="/happyco/demo" className="font-black text-[#35146B] underline">
            /happyco/demo
          </Link>
          .
        </p>
      </div>
      <PropertyOpsIntelligencePage envId={envId} />
    </div>
  );
}
