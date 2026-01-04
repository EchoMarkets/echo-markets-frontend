"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SharesInput } from "./SharesInput";
import { PriceImpact } from "./PriceImpact";
import { ConfirmDialog } from "./ConfirmDialog";
import { useWalletStore, useUIStore } from "@/lib/store";
import { formatSats, calculatePrice } from "@/lib/utils";
import type { Market } from "@/types";

interface TradingPanelProps {
  market: Market;
  onTrade?: (outcome: "Yes" | "No", amount: number) => Promise<void>;
}

export function TradingPanel({ market, onTrade }: TradingPanelProps) {
  const { wallet } = useWalletStore();
  const { addToast } = useUIStore();

  const [selectedOutcome, setSelectedOutcome] = useState<"Yes" | "No">("Yes");
  const [amount, setAmount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate current prices
  const prices = useMemo(
    () => calculatePrice(market.yesSupply, market.noSupply),
    [market.yesSupply, market.noSupply]
  );

  // Calculate shares received and price impact
  const tradeDetails = useMemo(() => {
    if (amount <= 0) {
      return { shares: 0, avgPrice: 0, priceImpact: 0, potentialPayout: 0 };
    }

    const currentPrice = selectedOutcome === "Yes" ? prices.yes : prices.no;

    // Simple linear model for Hackathon MVP - in production use LMSR or similar AMM
    // Shares = amount / (price / 100)
    const shares = Math.floor(amount / (currentPrice / 100));

    // Price impact estimation
    const totalSupply = market.yesSupply + market.noSupply;
    const priceImpact =
      totalSupply > 0 ? (shares / (totalSupply + shares)) * 100 : 0;

    // Average price paid
    const avgPrice = shares > 0 ? (amount / shares) * 100 : currentPrice;

    // Potential payout if this outcome wins (1 sat per share)
    const potentialPayout = shares;

    return { shares, avgPrice, priceImpact, potentialPayout };
  }, [amount, selectedOutcome, prices, market.yesSupply, market.noSupply]);

  // Check if trading is allowed
  const now = Math.floor(Date.now() / 1000);
  const canTrade =
    market.status === "Active" && now < market.params.tradingDeadline;
  const hasBalance = wallet && wallet.balance >= amount;

  const handleTrade = async () => {
    if (!wallet || !canTrade || amount <= 0) return;

    setShowConfirm(false);
    setIsProcessing(true);
    setError(null);

    try {
      if (onTrade) {
        await onTrade(selectedOutcome, amount);
      }

      addToast({
        type: "success",
        title: "Trade Submitted",
        message: `Buying ${
          tradeDetails.shares
        } ${selectedOutcome} shares for ${formatSats(amount)}`,
      });

      setAmount(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Trade failed";
      setError(message);
      addToast({
        type: "error",
        title: "Trade Failed",
        message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!canTrade) {
    return (
      <div className="bg-surface-1 border border-white/10 rounded-2xl p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Trading Closed
          </h3>
          <p className="text-zinc-400 text-sm">
            {market.status === "Resolved"
              ? "This market has been resolved."
              : "Trading deadline has passed."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-1 border border-white/10 rounded-2xl p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Trade
        </h3>

        {/* Outcome Selection */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <OutcomeButton
            outcome="Yes"
            price={prices.yes}
            selected={selectedOutcome === "Yes"}
            onClick={() => setSelectedOutcome("Yes")}
            disabled={isProcessing}
          />
          <OutcomeButton
            outcome="No"
            price={prices.no}
            selected={selectedOutcome === "No"}
            onClick={() => setSelectedOutcome("No")}
            disabled={isProcessing}
          />
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <SharesInput
            value={amount}
            onChange={setAmount}
            maxAmount={wallet?.balance || 0}
            disabled={isProcessing}
            label="Amount to spend"
          />
        </div>

        {/* Trade Summary */}
        <AnimatePresence>
          {amount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <div className="bg-surface-2 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">You receive</span>
                  <span className="text-white font-medium">
                    {tradeDetails.shares.toLocaleString()} {selectedOutcome}{" "}
                    shares
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Average price</span>
                  <span className="text-white font-medium">
                    {tradeDetails.avgPrice.toFixed(1)}¢
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Potential payout</span>
                  <span className="text-green-400 font-medium">
                    {formatSats(tradeDetails.potentialPayout)}
                  </span>
                </div>

                <PriceImpact impact={tradeDetails.priceImpact} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Trade Button */}
        <Button
          variant={selectedOutcome === "Yes" ? "yes" : "no"}
          size="lg"
          className="w-full"
          onClick={() => setShowConfirm(true)}
          disabled={!wallet || amount <= 0 || !hasBalance || isProcessing}
          isLoading={isProcessing}
        >
          {!wallet ? (
            "Connect Wallet"
          ) : !hasBalance ? (
            "Insufficient Balance"
          ) : amount <= 0 ? (
            "Enter Amount"
          ) : (
            <>Buy {selectedOutcome}</>
          )}
        </Button>

        {/* Balance Display */}
        {wallet && (
          <div className="mt-3 text-center text-xs text-zinc-500">
            Balance: {formatSats(wallet.balance)}
          </div>
        )}
      </motion.div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleTrade}
        outcome={selectedOutcome}
        amount={amount}
        shares={tradeDetails.shares}
        avgPrice={tradeDetails.avgPrice}
        potentialPayout={tradeDetails.potentialPayout}
        marketQuestion={market.question}
      />
    </>
  );
}

// =============================================================================
// OUTCOME BUTTON COMPONENT
// =============================================================================

interface OutcomeButtonProps {
  outcome: "Yes" | "No";
  price: number;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function OutcomeButton({
  outcome,
  price,
  selected,
  onClick,
  disabled,
}: OutcomeButtonProps) {
  const isYes = outcome === "Yes";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative p-4 rounded-xl border-2 transition-all duration-200
        ${
          selected
            ? isYes
              ? "border-yes bg-yes/20"
              : "border-no bg-no/20"
            : "border-white/10 bg-surface-2 hover:border-white/20"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`font-semibold ${
            selected ? (isYes ? "text-yes" : "text-no") : "text-white"
          }`}
        >
          {outcome}
        </span>
        {isYes ? (
          <TrendingUp
            className={`w-4 h-4 ${selected ? "text-yes" : "text-zinc-500"}`}
          />
        ) : (
          <TrendingDown
            className={`w-4 h-4 ${selected ? "text-no" : "text-zinc-500"}`}
          />
        )}
      </div>
      <div
        className={`text-2xl font-bold ${
          selected ? (isYes ? "text-yes" : "text-no") : "text-white"
        }`}
      >
        {price}¢
      </div>
      <div className="text-xs text-zinc-500">per share</div>

      {/* Selection indicator */}
      {selected && (
        <motion.div
          layoutId="outcomeSelector"
          className={`absolute inset-0 rounded-xl border-2 ${
            isYes ? "border-yes" : "border-no"
          }`}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
}
