import RepeWorkspaceShell from "@/components/repe/workspace/RepeWorkspaceShell";

export default async function ReLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <RepeWorkspaceShell envId={envId}>{children}</RepeWorkspaceShell>;
}
