import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Value — Multiplayer",
  description: "A shared auction table for two to four players. Choose a role, inspect the clues and bid in secret.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
