"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Droplets,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWalletStore, useUIStore } from "@/lib/store";
import { copyToClipboard } from "@/lib/WalletService";
import { fetchUTXOs, calculateBalance } from "@/lib/bitcoin";
import { formatSats } from "@/lib/utils";

const TESTNET4_FAUCETS = [
  {
    name: "Mempool.space",
    url: "https://mempool.space/testnet4/faucet",
    description: "Official mempool.space faucet",
  },
  {
    name: "Testnet4.dev",
    url: "https://faucet.testnet4.dev/",
    description: "Community testnet4 faucet",
  },
];

const MINIMUM_BALANCE = 10000; // 10,000 sats minimum for trading

interface FundingInstructionsProps {
  onFunded?: () => void;
  minimumBalance?: number;
}

export function FundingInstructions({
  onFunded,
  minimumBalance = MINIMUM_BALANCE,
}: FundingInstructionsProps) {
  const { wallet, setWallet } = useWalletStore();
  const { addToast } = useUIStore();

  const [copied, setCopied] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const isFunded = wallet && wallet.balance >= minimumBalance;

  // Auto-poll for balance updates
  useEffect(() => {
    if (!wallet || isFunded || !isMonitoring) return;

    const pollInterval = setInterval(async () => {
      try {
        const utxos = await fetchUTXOs(wallet.address);
        const balance = calculateBalance(utxos);

        if (balance !== wallet.balance) {
          setWallet({ ...wallet, utxos, balance });

          if (balance >= minimumBalance) {
            addToast({
              type: "success",
              title: "Wallet Funded!",
              message: `Received ${formatSats(
                balance
              )}. You're ready to trade!`,
            });
            setIsMonitoring(false);
            onFunded?.();
          }
        }

        setPollCount((c) => c + 1);
      } catch (err) {
        console.error("Balance poll failed:", err);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [
    wallet,
    isFunded,
    isMonitoring,
    minimumBalance,
    setWallet,
    addToast,
    onFunded,
  ]);

  // Start monitoring when component mounts
  useEffect(() => {
    if (wallet && !isFunded) {
      setIsMonitoring(true);
    }
  }, [wallet, isFunded]);

  const handleCopyAddress = async () => {
    if (!wallet) return;
    const success = await copyToClipboard(wallet.address);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast({
        type: "success",
        title: "Copied",
        message: "Address copied to clipboard",
        duration: 2000,
      });
    }
  };

  const handleManualRefresh = async () => {
    if (!wallet) return;
    try {
      const utxos = await fetchUTXOs(wallet.address);
      const balance = calculateBalance(utxos);
      setWallet({ ...wallet, utxos, balance });

      if (balance >= minimumBalance && !isFunded) {
        addToast({
          type: "success",
          title: "Wallet Funded!",
          message: `Balance: ${formatSats(balance)}`,
        });
        onFunded?.();
      } else if (balance > 0) {
        addToast({
          type: "info",
          title: "Balance Updated",
          message: `Current balance: ${formatSats(balance)}`,
        });
      }
    } catch {
      addToast({
        type: "error",
        title: "Refresh Failed",
        message: "Could not fetch balance",
      });
    }
  };

  if (!wallet) return null;

  if (isFunded) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center"
      >
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
          <Check className="w-6 h-6 text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-green-400 mb-1">
          Wallet Funded
        </h3>
        <p className="text-zinc-400 text-sm">
          Balance: {formatSats(wallet.balance)}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-white/10 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Droplets className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Fund Your Wallet</h3>
          <p className="text-xs text-zinc-500">
            Get free testnet4 Bitcoin to start trading
          </p>
        </div>
      </div>

      {/* Your Address */}
      <div className="mb-6">
        <label className="text-xs text-zinc-500 mb-2 block">
          Your Testnet4 Address
        </label>
        <div className="flex gap-2">
          <div className="flex-1 bg-surface-2 border border-white/10 rounded-xl px-4 py-3 overflow-hidden">
            <code className="text-xs text-white font-mono break-all">
              {wallet.address}
            </code>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyAddress}
            className="shrink-0"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Faucet Links */}
      <div className="space-y-3 mb-6">
        <label className="text-xs text-zinc-500 block">Get Testnet Coins</label>
        {TESTNET4_FAUCETS.map((faucet) => (
          <a
            key={faucet.url}
            href={faucet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-surface-2 border border-white/10 rounded-xl hover:border-accent/50 transition-colors group"
          >
            <div>
              <div className="text-sm font-medium text-white group-hover:text-accent transition-colors">
                {faucet.name}
              </div>
              <div className="text-xs text-zinc-500">{faucet.description}</div>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-accent transition-colors" />
          </a>
        ))}
      </div>

      {/* Monitoring Status */}
      <div className="p-4 bg-surface-2 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isMonitoring ? (
              <>
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400">
                  Monitoring for deposits...
                </span>
              </>
            ) : (
              <span className="text-sm text-zinc-400">Monitoring paused</span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleManualRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Current balance: {formatSats(wallet.balance)}</span>
          <span>Minimum: {formatSats(minimumBalance)}</span>
        </div>

        {pollCount > 0 && (
          <div className="text-xs text-zinc-600 mt-1">
            Checked {pollCount} time{pollCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p className="text-yellow-400 text-xs">
          <strong>Steps:</strong> 1) Copy your address above → 2) Visit a faucet
          → 3) Paste address and request coins → 4) Wait for confirmation
          (usually 1-2 minutes)
        </p>
      </div>
    </motion.div>
  );
}
