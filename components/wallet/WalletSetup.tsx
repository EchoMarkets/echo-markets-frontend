"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Key, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WalletService } from "@/lib/WalletService";
import { useWalletStore, useUIStore } from "@/lib/store";

interface WalletSetupProps {
  onComplete?: () => void;
}

export function WalletSetup({ onComplete }: WalletSetupProps) {
  const [mode, setMode] = useState<"select" | "import">("select");
  const [isProcessing, setIsProcessing] = useState(false);
  const [importPhrase, setImportPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { setWallet, setMnemonic } = useWalletStore();
  const { addToast } = useUIStore();

  const walletService = new WalletService(true); // testnet4

  const handleCreateWallet = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const walletData = await walletService.createWallet();
      const primaryAddress = walletData.addresses[0];

      // Update store
      setMnemonic(walletData.mnemonic);
      setWallet({
        address: walletData.address,
        publicKey: walletData.publicKey,
        internalPubkey: walletData.internalPubkey,
        tweakedPrivateKey: primaryAddress.tweakedPrivateKey,
        path: primaryAddress.derivationPath,
        index: primaryAddress.index,
        balance: 0,
        utxos: [],
      });

      addToast({
        type: "success",
        title: "Wallet Created",
        message:
          "Your new Taproot wallet is ready. Make sure to save your seed phrase!",
      });

      onComplete?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create wallet";
      setError(message);
      addToast({
        type: "error",
        title: "Creation Failed",
        message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportWallet = async () => {
    const trimmedPhrase = importPhrase.trim().toLowerCase();

    // Basic validation
    const words = trimmedPhrase.split(/\s+/);
    if (words.length !== 12) {
      setError("Seed phrase must be exactly 12 words");
      return;
    }

    if (!walletService.validateMnemonic(trimmedPhrase)) {
      setError("Invalid seed phrase. Please check your words.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const walletData = await walletService.createWallet(trimmedPhrase);
      const primaryAddress = walletData.addresses[0];

      // Update store
      setMnemonic(walletData.mnemonic);
      setWallet({
        address: walletData.address,
        publicKey: walletData.publicKey,
        internalPubkey: walletData.internalPubkey,
        tweakedPrivateKey: primaryAddress.tweakedPrivateKey,
        path: primaryAddress.derivationPath,
        index: primaryAddress.index,
        balance: 0,
        utxos: [],
      });

      addToast({
        type: "success",
        title: "Wallet Imported",
        message: "Your wallet has been restored successfully.",
      });

      setImportPhrase("");
      onComplete?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import wallet";
      setError(message);
      addToast({
        type: "error",
        title: "Import Failed",
        message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (mode === "import") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-1 border border-white/10 rounded-2xl p-6 max-w-md mx-auto"
      >
        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Download className="w-5 h-5 text-accent" />
          Import Wallet
        </h3>
        <p className="text-zinc-400 text-sm mb-6">
          Enter your 12-word seed phrase to restore your wallet.
        </p>

        <div className="space-y-4">
          <textarea
            value={importPhrase}
            onChange={(e) => {
              setImportPhrase(e.target.value);
              setError(null);
            }}
            placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
            rows={4}
            className="w-full px-4 py-3 bg-surface-2 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none font-mono text-sm"
            disabled={isProcessing}
          />

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-400 text-sm flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>
                Make sure your seed phrase is correct. An incorrect phrase will
                create a different wallet.
              </span>
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setMode("select");
                setImportPhrase("");
                setError(null);
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleImportWallet}
              disabled={!importPhrase.trim() || isProcessing}
              isLoading={isProcessing}
            >
              {isProcessing ? "Importing..." : "Import Wallet"}
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-white/10 rounded-2xl p-6 max-w-md mx-auto"
    >
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-accent to-bitcoin-gold flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-8 h-8 text-black" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">
          Connect Your Wallet
        </h3>
        <p className="text-zinc-400 text-sm">
          Create a new Taproot wallet or import an existing one.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleCreateWallet}
          disabled={isProcessing}
          isLoading={isProcessing}
        >
          <Key className="w-5 h-5 mr-2" />
          {isProcessing ? "Creating..." : "Create New Wallet"}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => setMode("import")}
          disabled={isProcessing}
        >
          <Download className="w-5 h-5 mr-2" />
          Import Existing Wallet
        </Button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-surface-2 rounded-xl">
        <h4 className="text-sm font-semibold text-white mb-2">Features</h4>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            BIP39 seed phrase (12 words)
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            Taproot (P2TR) addresses
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            Testnet4 compatible
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            Browser-only (keys never leave device)
          </li>
        </ul>
      </div>
    </motion.div>
  );
}
