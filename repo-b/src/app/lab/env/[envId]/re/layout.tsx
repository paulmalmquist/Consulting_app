import RepeWorkspaceShell from "@/components/repe/workspace/RepeWorkspaceShell";
import { ReEnvProvider } from "@/components/repe/workspace/ReEnvProvider";
import { isAdminSession } from "@/lib/server/sessionRole";

export default async function ReLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <ReEnvProvider envId={envId}>
      <RepeWorkspaceShell envId={envId} isAdmin={isAdminSession()}>{children}</RepeWorkspaceShell>
    </ReEnvProvider>
  );
}
