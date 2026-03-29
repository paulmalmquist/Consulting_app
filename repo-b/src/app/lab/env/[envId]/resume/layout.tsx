import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";
import ResumeFallbackCard from "@/components/resume/ResumeFallbackCard";
import { isValidEnvId } from "@/lib/resume/workspace";

export default async function ResumeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const domain = "resume" as const;

  if (!isValidEnvId(envId)) {
    return (
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Resume data unavailable"
        body="This route needs a valid environment id before the visual resume workspace can initialize."
        tone="error"
      />
    );
  }

  return (
    <DomainEnvProvider domain={domain} envId={envId}>
      <DomainWorkspaceShell envId={envId} domain={domain}>
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
