import { BusinessProvider } from "@/lib/business-context";
import BosAppShell from "@/components/bos/BosAppShell";

export default function IngestLayout({ children }: { children: React.ReactNode }) {
  return (
    <BusinessProvider>
      <BosAppShell>{children}</BosAppShell>
    </BusinessProvider>
  );
}
