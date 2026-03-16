import { PsychragShell } from "@/components/psychrag/PsychragShell";

export default function PsychragLayout({ children }: { children: React.ReactNode }) {
  return <PsychragShell>{children}</PsychragShell>;
}
