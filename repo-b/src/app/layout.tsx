import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo Lab",
  description: "Safe, auditable AI workflow automation demo"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
