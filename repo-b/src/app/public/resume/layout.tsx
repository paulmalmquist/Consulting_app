export const metadata = {
  title: "Visual Resume",
  description: "Interactive visual resume powered by the Winston platform.",
};

export default function PublicResumeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bm-bg text-bm-text">
      <header className="border-b border-bm-border/40 px-6 py-4">
        <p className="text-sm font-semibold tracking-wide text-bm-muted2 uppercase">
          Visual Resume
        </p>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
