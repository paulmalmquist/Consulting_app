import { EnvProvider } from "@/components/EnvProvider";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EnvProvider>{children}</EnvProvider>;
}
