import LabEnvironmentShell from "@/components/lab/LabEnvironmentShell";
import { isAdminSession } from "@/lib/server/sessionRole";

export default async function LabEnvironmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;

  return <LabEnvironmentShell envId={envId} isAdmin={isAdminSession()}>{children}</LabEnvironmentShell>;
}
