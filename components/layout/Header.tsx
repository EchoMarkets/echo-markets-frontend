"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  PlusCircle,
  Briefcase,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { useWalletStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { formatAddress, formatSats } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Markets", icon: TrendingUp },
  { href: "/create", label: "Create", icon: PlusCircle },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
];

export function Header() {
  const pathname = usePathname();
  const { wallet } = useWalletStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-surface-0/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <Image
                src="/logo-echomarkets-gradient.svg"
                alt="Echo Markets"
                width={32}
                height={32}
                className="w-full h-full"
                priority
              />
            </div>
            <span className="font-bold text-xl hidden sm:block">
              Echo<span className="text-accent">Markets</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link key={item.href} href={item.href}>
                  <motion.div
                    className={cn(
                      "px-4 py-2 rounded-lg flex items-center gap-2 transition-colors",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{item.label}</span>
                  </motion.div>
                </Link>
              );
            })}
          </nav>

          {/* Wallet / Connect Button */}
          <div className="flex items-center gap-3">
            {wallet ? (
              <Link href="/wallet">
                <motion.div
                  className="flex items-center gap-3 px-4 py-2 rounded-xl bg-surface-2 border border-white/10 hover:border-accent/50 transition-colors cursor-pointer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-linear-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-sm font-medium">
                      {formatAddress(wallet.address)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatSats(wallet.balance)}
                    </div>
                  </div>
                </motion.div>
              </Link>
            ) : (
              <Link href="/wallet">
                <Button variant="primary" size="sm">
                  <Wallet className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Connect Wallet</span>
                  <span className="sm:hidden">Connect</span>
                </Button>
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-zinc-400 hover:text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-white/5"
          >
            <nav className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div
                      className={cn(
                        "px-4 py-3 rounded-lg flex items-center gap-3",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-zinc-400 hover:text-white"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </div>

      {/* Testnet Banner */}
      <div className="bg-yellow-500/10 border-t border-yellow-500/20">
        <div className="container mx-auto px-4 py-1">
          <p className="text-xs text-center text-yellow-500/80">
            ⚠️ Testnet4 Only — Not real Bitcoin
            <a
              href="https://mempool.space/testnet4/faucet"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 underline inline-flex items-center gap-1"
            >
              Get testnet coins
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>
    </header>
  );
}
