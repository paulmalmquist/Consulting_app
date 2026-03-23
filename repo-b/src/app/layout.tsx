import type { Metadata } from "next";
import { EnvProvider } from "@/components/EnvProvider";

export const metadata: Metadata = {
  title: "Winston Demo Lab",
  description: "Docs-backed market intelligence landing surface for Winston lab environments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <EnvProvider>{children}</EnvProvider>
      </body>
    </html>
  );
}
