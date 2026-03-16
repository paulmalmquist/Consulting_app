import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export default function PsychragLandingPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <Badge variant="accent">HIPAA-ready defaults</Badge>
          <CardTitle className="mt-4 text-4xl tracking-[-0.04em]">Clinical literature, safety gating, and therapist collaboration in one bounded module.</CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7">
            PsychRAG combines structured clinical retrieval, crisis-aware therapy chat, patient-led transcript sharing, and clinician review workflows inside the existing Business Machine monorepo without leaking into Winston’s business-domain assistant stack.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/psychrag/signup"><Button>Create account</Button></Link>
          <Link href="/psychrag/login"><Button variant="secondary">Sign in</Button></Link>
        </CardContent>
      </Card>

      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Launch paths</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <Link href="/psychrag/patient/chat" className="block rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300">
            Patient therapy chat
          </Link>
          <Link href="/psychrag/therapist/dashboard" className="block rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300">
            Therapist dashboard
          </Link>
          <Link href="/psychrag/admin/library" className="block rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300">
            Admin knowledge base
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
