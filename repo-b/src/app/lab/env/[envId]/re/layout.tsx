import RepeWorkspaceShell from "@/components/repe/workspace/RepeWorkspaceShell";
import { ReEnvProvider } from "@/components/repe/workspace/ReEnvProvider";
import { RepeFilterProvider } from "@/components/repe/workspace/RepeFilterContext";

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
      <RepeFilterProvider>
        <RepeWorkspaceShell envId={envId}>{children}</RepeWorkspaceShell>
      </RepeFilterProvider>
    </ReEnvProvider>
  );
}
