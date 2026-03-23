import Link from "next/link";
import { PsychragAuthForm } from "@/components/psychrag/PsychragAuthForm";

export default function PsychragLoginPage() {
  return (
    <div className="space-y-6">
      <PsychragAuthForm mode="login" />
      <p className="text-center text-sm text-slate-600">
        Need an account? <Link href="/psychrag/signup" className="font-medium text-emerald-700">Create one here</Link>.
      </p>
    </div>
  );
}
