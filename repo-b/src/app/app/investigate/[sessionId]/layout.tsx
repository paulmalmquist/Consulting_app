import { EnvProvider } from "@/components/EnvProvider";
import { WinstonProviders } from "@/components/Providers";

// Full-bleed standalone investigation workspace (plan PR 7). Provides env context
// (EnvProvider) but NOT the app shell — the workspace owns the whole viewport.
export default function InvestigateLayout({ children }: { children: React.ReactNode }) {
  return (
    <WinstonProviders>
      <EnvProvider>{children}</EnvProvider>
    </WinstonProviders>
  );
}
