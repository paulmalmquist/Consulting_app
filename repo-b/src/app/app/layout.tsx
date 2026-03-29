import { EnvProvider } from "@/components/EnvProvider";
import { BusinessProvider } from "@/lib/business-context";
import BosAppShell from "@/components/bos/BosAppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnvProvider>
      <BusinessProvider>
        <BosAppShell>{children}</BosAppShell>
      </BusinessProvider>
    </EnvProvider>
  );
}
