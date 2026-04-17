import LabEnvTopBar from "@/components/lab/LabEnvTopBar";
import LabEnvironmentShell from "@/components/lab/LabEnvironmentShell";

export default async function LabEnvironmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;

  return (
    <>
      <LabEnvTopBar envId={envId} />
      <LabEnvironmentShell envId={envId}>{children}</LabEnvironmentShell>
    </>
  );
}
