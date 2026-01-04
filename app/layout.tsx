import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Toaster } from "@/components/ui/Toaster";

export const metadata: Metadata = {
  title: "Echo Markets | Bitcoin Prediction Market on Charms Protocol",
  description:
    "Decentralized prediction markets on Bitcoin via Charms protocol",
  keywords: ["bitcoin", "prediction markets", "charms", "testnet4", "defi"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-0">
        {/* Background effects */}
        <div className="fixed inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="fixed inset-0 bg-gradient-radial from-accent/5 via-transparent to-transparent pointer-events-none" />

        {/* Main content */}
        <div className="relative z-10">
          <Header />
          <main className="container mx-auto px-4 py-8">{children}</main>
        </div>

        {/* Toast notifications */}
        <Toaster />
      </body>
    </html>
  );
}
