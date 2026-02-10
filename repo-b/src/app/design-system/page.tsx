import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import ShowcaseClient from "@/app/design-system/ShowcaseClient";

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl border border-bm-border/70", className)} />
      <div className="text-sm">
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-bm-muted2 font-mono">{className}</div>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-bm-muted2">
              Business Machine
            </p>
            <h1 className="text-3xl font-bold">Design System</h1>
            <p className="text-sm text-bm-muted">
              Tokens, typography, and UI primitives used across marketing + app.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Home
            </Link>
            <Link href="/app" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              App
            </Link>
            <Link href="/lab" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Lab
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Colors (Semantic)</CardTitle>
              <CardDescription>All colors route through CSS variables.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Swatch label="Background" className="bg-bm-bg" />
              <Swatch label="Surface" className="bg-bm-surface" />
              <Swatch label="Surface 2" className="bg-bm-surface2" />
              <Swatch label="Border" className="bg-bm-border" />
              <Swatch label="Text" className="bg-bm-text" />
              <Swatch label="Muted" className="bg-bm-muted" />
              <Swatch label="Accent" className="bg-bm-accent" />
              <Swatch label="Accent 2" className="bg-bm-accent2" />
              <Swatch label="Success" className="bg-bm-success" />
              <Swatch label="Warning" className="bg-bm-warning" />
              <Swatch label="Danger" className="bg-bm-danger" />
              <Swatch label="Ring" className="bg-bm-ring" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>Display font for headings, body for UI + copy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <div className="text-xs text-bm-muted2 uppercase tracking-[0.18em]">H1</div>
                <div className="text-3xl font-bold">Organize and optimize your business</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-bm-muted2 uppercase tracking-[0.18em]">Body</div>
                <p className="text-sm text-bm-muted leading-6">
                  Dark glass surfaces, neon accents, and crisp typography. Focus states are
                  visible and high-contrast.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-bm-muted2 uppercase tracking-[0.18em]">Mono</div>
                <p className="text-sm font-mono text-bm-muted">
                  run_id=0f9a1d2c status=completed
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Buttons + Badges</CardTitle>
              <CardDescription>Variants and states.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button disabled>Disabled</Button>
              <span className="w-full h-px bg-bm-border/60 my-2" />
              <Badge>Default</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Forms</CardTitle>
              <CardDescription>Inputs, selects, and textareas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-bm-muted2">Name</label>
                <Input className="mt-2" placeholder="Acme Health" />
              </div>
              <div>
                <label className="text-xs text-bm-muted2">Industry</label>
                <Select className="mt-2" defaultValue="healthcare">
                  <option value="healthcare">healthcare</option>
                  <option value="legal">legal</option>
                  <option value="construction">construction</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-bm-muted2">Notes</label>
                <Textarea className="mt-2" rows={3} placeholder="Optional notes…" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Dialog + Toast</CardTitle>
              <CardDescription>Lightweight primitives (no external UI library).</CardDescription>
            </CardHeader>
            <CardContent>
              <ShowcaseClient />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Glass Surface</CardTitle>
              <CardDescription>Reusable glass utility classes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bm-glass rounded-2xl p-5">
                <div className="text-sm font-semibold">bm-glass</div>
                <div className="text-sm text-bm-muted mt-1">
                  Use for static panels that sit on the global vignette background.
                </div>
              </div>
              <div className="bm-glass-interactive rounded-2xl p-5">
                <div className="text-sm font-semibold">bm-glass-interactive</div>
                <div className="text-sm text-bm-muted mt-1">
                  Hover border brightens and adds a restrained glow.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Example Table</CardTitle>
              <CardDescription>Simple table styling for data views.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-bm-muted text-xs uppercase border-b border-bm-border/70">
                  <tr>
                    <th className="text-left py-2">Time</th>
                    <th className="text-left py-2">Actor</th>
                    <th className="text-left py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { t: "10:12", a: "Demo Lab", x: "upload_document" },
                    { t: "10:13", a: "Demo Lab", x: "enqueue_action" },
                  ].map((row) => (
                    <tr
                      key={row.t}
                      className="border-b border-bm-border/60 hover:bg-bm-surface/30 transition"
                    >
                      <td className="py-2 text-bm-muted">{row.t}</td>
                      <td className="py-2">{row.a}</td>
                      <td className="py-2 text-bm-muted">{row.x}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
