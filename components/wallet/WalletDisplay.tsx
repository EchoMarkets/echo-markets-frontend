"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWalletStore, useUIStore } from "@/lib/store";
import { formatSats } from "@/lib/utils";
import { copyToClipboard } from "@/lib/WalletService";
import { fetchUTXOs, calculateBalance } from "@/lib/bitcoin";

interface WalletDisplayProps {
  showSeedPhraseOption?: boolean;
  onReset?: () => void;
}

export function WalletDisplay({
  showSeedPhraseOption = true,
  onReset,
}: WalletDisplayProps) {
  const { wallet, mnemonic, setWallet, clearWallet } = useWalletStore();
  const { addToast } = useUIStore();

  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState<"address" | "seed" | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!wallet) return null;

  const handleCopyAddress = async () => {
    const success = await copyToClipboard(wallet.address);
    if (success) {
      setCopied("address");
      setTimeout(() => setCopied(null), 2000);
      addToast({
        type: "success",
        title: "Copied",
        message: "Address copied to clipboard",
        duration: 2000,
      });
    }
  };

  const handleCopySeedPhrase = async () => {
    if (!mnemonic) return;
    const success = await copyToClipboard(mnemonic);
    if (success) {
      setCopied("seed");
      setTimeout(() => setCopied(null), 2000);
      addToast({
        type: "success",
        title: "Copied",
        message: "Seed phrase copied to clipboard",
        duration: 2000,
      });
    }
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    try {
      const utxos = await fetchUTXOs(wallet.address);
      const balance = calculateBalance(utxos);
      setWallet({ ...wallet, utxos, balance });
      addToast({
        type: "success",
        title: "Balance Updated",
        message: `Current balance: ${formatSats(balance)}`,
        duration: 3000,
      });
    } catch {
      addToast({
        type: "error",
        title: "Refresh Failed",
        message: "Could not fetch balance",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetWallet = () => {
    clearWallet();
    setShowResetConfirm(false);
    addToast({
      type: "info",
      title: "Wallet Reset",
      message: "Your wallet has been disconnected",
    });
    onReset?.();
  };

  const explorerUrl = `https://mempool.space/testnet4/address/${wallet.address}`;

  return (
    <div className="space-y-4">
      {/* Wallet Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-1 border border-green-500/30 rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-green-400 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-green-400" />
            </div>
            Wallet Connected
          </h3>
          <span className="text-xs text-zinc-500 bg-surface-2 px-2 py-1 rounded-full">
            Testnet4
          </span>
        </div>

        {/* Address */}
        <div className="mb-4">
          <label className="text-xs text-zinc-500 mb-1 block">Address</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surface-2 border border-white/10 rounded-xl px-4 py-3">
              <code className="text-sm text-white font-mono break-all">
                {wallet.address}
              </code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAddress}
              className="shrink-0"
            >
              {copied === "address" ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button variant="ghost" size="sm">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>

        {/* Balance */}
        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-xl">
          <div>
            <label className="text-xs text-zinc-500 block">Balance</label>
            <div className="text-2xl font-bold text-white">
              {formatSats(wallet.balance)}
            </div>
            <div className="text-xs text-zinc-500">
              {wallet.utxos.length} UTXO{wallet.utxos.length !== 1 ? "s" : ""}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshBalance}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </motion.div>

      {/* Seed Phrase Section */}
      {showSeedPhraseOption && mnemonic && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-1 border border-white/10 rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white">Seed Phrase</h4>
            <Button
              variant={showSeedPhrase ? "danger" : "secondary"}
              size="sm"
              onClick={() => setShowSeedPhrase(!showSeedPhrase)}
            >
              {showSeedPhrase ? (
                <>
                  <EyeOff className="w-4 h-4 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-1" />
                  Show
                </>
              )}
            </Button>
          </div>

          <AnimatePresence>
            {showSeedPhrase && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="bg-surface-2 border border-white/10 rounded-xl p-4">
                  <code className="text-sm text-white font-mono leading-relaxed break-all">
                    {mnemonic}
                  </code>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={handleCopySeedPhrase}
                >
                  {copied === "seed" ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Seed Phrase
                    </>
                  )}
                </Button>

                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Keep your seed phrase safe and private. Never share it
                      with anyone! This is the only way to recover your wallet.
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Reset Wallet */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {!showResetConfirm ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-zinc-500 hover:text-red-400"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset Wallet
          </Button>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-sm text-red-400 mb-3">
              Are you sure? This will disconnect your wallet. Make sure you have
              saved your seed phrase!
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={handleResetWallet}
              >
                Reset Wallet
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
