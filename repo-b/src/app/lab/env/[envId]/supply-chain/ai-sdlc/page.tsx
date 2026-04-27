import AISDLCPanel from "@/components/supply-chain/AISDLCPanel";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function AISDLCPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI SDLC"
        title="AI-accelerated delivery"
        blurb="Discovery, modeling, build, testing, deploy, and consume — six phases where AI compresses the lift while humans keep the gates. Each phase has a sample artifact and an explicit promotion control."
      />
      <AISDLCPanel />
    </>
  );
}
