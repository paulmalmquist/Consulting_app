"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getPsychragSupabaseClient } from "@/lib/psychrag/auth";

export function PsychragAuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const client = getPsychragSupabaseClient();
    if (!client) {
      setError("Supabase is not configured in this environment.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await client.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      router.push("/psychrag/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl border border-white/70 bg-white/80">
      <CardHeader>
        <CardTitle>{mode === "signup" ? "Create your PsychRAG account" : "Sign in to PsychRAG"}</CardTitle>
        <CardDescription>
          {mode === "signup"
            ? "Use Supabase Auth for the clinical portal. You’ll choose your role and therapist connection on the next step."
            : "Continue to the patient or therapist workspace with your PsychRAG identity."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm text-slate-700">
            <span>Email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block space-y-2 text-sm text-slate-700">
            <span>Password</span>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
