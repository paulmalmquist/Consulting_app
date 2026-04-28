import AISDLCPanel from "@/components/supply-chain/AISDLCPanel";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function AISDLCPage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="AI SDLC"
        title="AI-accelerated delivery"
        blurb="Discovery, modeling, build, testing, deploy, and consume — six phases where AI compresses the lift while humans keep the gates. Each phase has a sample artifact and an explicit promotion control."
      />
      <AISDLCPanel />
      <NotebookCallout pageSlug="ai-sdlc" envId={envId} />
    </>
  );
}
