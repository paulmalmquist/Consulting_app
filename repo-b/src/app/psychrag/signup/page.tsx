import Link from "next/link";
import { PsychragAuthForm } from "@/components/psychrag/PsychragAuthForm";

export default function PsychragSignupPage() {
  return (
    <div className="space-y-6">
      <PsychragAuthForm mode="signup" />
      <p className="text-center text-sm text-slate-600">
        Already have an account? <Link href="/psychrag/login" className="font-medium text-emerald-700">Sign in</Link>.
      </p>
    </div>
  );
}
