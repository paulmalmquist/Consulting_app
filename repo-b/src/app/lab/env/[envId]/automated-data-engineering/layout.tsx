import AdeShell from "@/components/automated-data-engineering/AdeShell";

// Full-bleed control room. The lab shell yields full-bleed for
// /automated-data-engineering (isDomainRoute), and AdeShell carries its dark
// palette inline, so no theme pinning is needed here.
export default function AdeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { envId: string };
}) {
  const { envId } = params;
  return <AdeShell envId={envId}>{children}</AdeShell>;
}
