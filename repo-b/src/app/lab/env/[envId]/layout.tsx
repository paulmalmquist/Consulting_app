import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import LabEnvTopBar from "@/components/lab/LabEnvTopBar";
import LabEnvironmentShell from "@/components/lab/LabEnvironmentShell";
import "../../../_typography.css";

export default async function LabEnvironmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;

  return (
    <div className={`re-shell ${GeistSans.variable} ${GeistMono.variable}`}>
      <LabEnvTopBar envId={envId} />
      <LabEnvironmentShell envId={envId}>{children}</LabEnvironmentShell>
    </div>
  );
}
