import AppShell from "@/components/AppShell";
import { EnvProvider } from "@/components/EnvProvider";
import { WinstonProviders } from "@/components/Providers";
import { BusinessProvider } from "@/lib/business-context";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnvProvider>
      <BusinessProvider>
        <WinstonProviders>
          <AppShell>{children}</AppShell>
        </WinstonProviders>
      </BusinessProvider>
    </EnvProvider>
  );
}
