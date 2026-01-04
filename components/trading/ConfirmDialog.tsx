"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, TrendingDown, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatSats } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  outcome: "Yes" | "No";
  amount: number;
  shares: number;
  avgPrice: number;
  potentialPayout: number;
  marketQuestion: string;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  outcome,
  amount,
  shares,
  avgPrice,
  potentialPayout,
  marketQuestion,
  isLoading = false,
}: ConfirmDialogProps) {
  const isYes = outcome === "Yes";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-[50%] -translate-y-1/2 z-50 mx-auto max-w-md"
          >
            <div className="bg-surface-1 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div
                className={`
                p-4 border-b border-white/10
                ${isYes ? "bg-yes/10" : "bg-no/10"}
              `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                      w-10 h-10 rounded-xl flex items-center justify-center
                      ${isYes ? "bg-yes/20" : "bg-no/20"}
                    `}
                    >
                      {isYes ? (
                        <TrendingUp className="w-5 h-5 text-yes" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-no" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        Confirm Trade
                      </h3>
                      <p
                        className={`text-sm ${isYes ? "text-yes" : "text-no"}`}
                      >
                        Buying {outcome} Shares
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="p-2 text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Market Question */}
                <div className="p-3 bg-surface-2 rounded-xl">
                  <p className="text-sm text-zinc-400 mb-1">Market</p>
                  <p className="text-white font-medium line-clamp-2">
                    {marketQuestion}
                  </p>
                </div>

                {/* Trade Details */}
                <div className="space-y-3">
                  <DetailRow
                    label="You Pay"
                    value={formatSats(amount)}
                    highlight
                  />
                  <DetailRow
                    label="You Receive"
                    value={`${shares.toLocaleString()} ${outcome} shares`}
                  />
                  <DetailRow
                    label="Average Price"
                    value={`${avgPrice.toFixed(1)}¢ per share`}
                  />

                  <div className="border-t border-white/10 pt-3">
                    <DetailRow
                      label="If outcome is YES"
                      value={isYes ? formatSats(potentialPayout) : "0 sats"}
                      valueClass={isYes ? "text-green-400" : "text-zinc-500"}
                    />
                    <DetailRow
                      label="If outcome is NO"
                      value={!isYes ? formatSats(potentialPayout) : "0 sats"}
                      valueClass={!isYes ? "text-green-400" : "text-zinc-500"}
                    />
                  </div>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-400">
                    This trade requires an on-chain Bitcoin transaction. Make
                    sure you have enough balance for network fees.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-white/10 flex gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant={isYes ? "yes" : "no"}
                  size="lg"
                  className="flex-1"
                  onClick={onConfirm}
                  disabled={isLoading}
                  isLoading={isLoading}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Confirm Trade
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// HELPER COMPONENT
// =============================================================================

interface DetailRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  valueClass?: string;
}

function DetailRow({ label, value, highlight, valueClass }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-400">{label}</span>
      <span
        className={`
        text-sm font-medium
        ${valueClass || (highlight ? "text-accent" : "text-white")}
      `}
      >
        {value}
      </span>
    </div>
  );
}
