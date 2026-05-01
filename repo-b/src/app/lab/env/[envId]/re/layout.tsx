import RepeWorkspaceShell from "@/components/repe/workspace/RepeWorkspaceShell";
import { ReEnvProvider } from "@/components/repe/workspace/ReEnvProvider";

export default async function ReLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const bypassAuth = process.env.PLAYWRIGHT_BYPASS_AUTH === "1";

  if (bypassAuth) {
    // In Playwright bypass mode there is no BOS backend running.
    // Skip ReEnvProvider (which calls BOS) and RepeWorkspaceShell (which blocks
    // on the context load). Render children directly so audit pages work.
    return <>{children}</>;
  }

  return (
    <ReEnvProvider envId={envId}>
      <RepeWorkspaceShell envId={envId}>{children}</RepeWorkspaceShell>
    </ReEnvProvider>
  );
}
