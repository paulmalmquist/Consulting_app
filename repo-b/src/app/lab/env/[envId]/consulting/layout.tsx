import { ConsultingEnvProvider } from "@/components/consulting/ConsultingEnvProvider";
import ConsultingWorkspaceShell from "@/components/consulting/ConsultingWorkspaceShell";

export default async function ConsultingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <ConsultingEnvProvider envId={envId}>
      <ConsultingWorkspaceShell envId={envId}>{children}</ConsultingWorkspaceShell>
    </ConsultingEnvProvider>
  );
}
