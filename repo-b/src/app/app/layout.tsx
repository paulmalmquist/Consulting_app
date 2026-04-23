import { EnvProvider } from "@/components/EnvProvider";
import { BusinessProvider } from "@/lib/business-context";
import BosAppShell from "@/components/bos/BosAppShell";
import { WinstonProviders } from "@/components/Providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WinstonProviders>
      <EnvProvider>
        <BusinessProvider>
          <BosAppShell>{children}</BosAppShell>
        </BusinessProvider>
      </EnvProvider>
    </WinstonProviders>
  );
}
