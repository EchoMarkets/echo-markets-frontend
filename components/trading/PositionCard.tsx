"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Coins, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatSats, formatTimeRemaining, getMarketStatus } from "@/lib/utils";
import type { Market } from "@/types";

interface Position {
  marketId: string;
  yesShares: number;
  noShares: number;
  avgYesPrice: number;
  avgNoPrice: number;
  totalInvested: number;
}

interface PositionCardProps {
  position: Position;
  market: Market;
  onSell?: (outcome: "Yes" | "No", shares: number) => void;
}

export function PositionCard({ position, market }: PositionCardProps) {
  const status = getMarketStatus(market);

  // Calculate current values
  const currentYesValue = position.yesShares * (market.yesPrice / 100);
  const currentNoValue = position.noShares * (market.noPrice / 100);
  const totalCurrentValue = currentYesValue + currentNoValue;

  // Calculate P&L
  const unrealizedPnL = totalCurrentValue - position.totalInvested;
  const pnlPercentage =
    position.totalInvested > 0
      ? (unrealizedPnL / position.totalInvested) * 100
      : 0;
  const isProfitable = unrealizedPnL >= 0;

  // Calculate potential payouts
  const yesWinPayout = position.yesShares; // 1 sat per share if YES wins
  const noWinPayout = position.noShares; // 1 sat per share if NO wins

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <Link href={`/market/${market.id}`}>
            <h3 className="font-semibold text-white hover:text-accent transition-colors line-clamp-2">
              {market.question}
            </h3>
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                status.canTrade
                  ? "bg-green-500/20 text-green-400"
                  : "bg-zinc-500/20 text-zinc-400"
              }`}
            >
              {status.label}
            </span>
            {status.canTrade && (
              <span className="text-xs text-zinc-500">
                Ends {formatTimeRemaining(market.params.tradingDeadline)}
              </span>
            )}
          </div>
        </div>

        <Link href={`/market/${market.id}`}>
          <Button variant="ghost" size="sm">
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Shares Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* YES Shares */}
        <div
          className={`
          p-3 rounded-xl border
          ${
            position.yesShares > 0
              ? "bg-yes/10 border-yes/30"
              : "bg-surface-2 border-white/5"
          }
        `}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp
              className={`w-4 h-4 ${
                position.yesShares > 0 ? "text-yes" : "text-zinc-500"
              }`}
            />
            <span className="text-xs font-medium text-zinc-400">YES</span>
          </div>
          <div
            className={`text-xl font-bold ${
              position.yesShares > 0 ? "text-yes" : "text-zinc-600"
            }`}
          >
            {position.yesShares.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">
            @ {position.avgYesPrice.toFixed(1)}¢ avg
          </div>
        </div>

        {/* NO Shares */}
        <div
          className={`
          p-3 rounded-xl border
          ${
            position.noShares > 0
              ? "bg-no/10 border-no/30"
              : "bg-surface-2 border-white/5"
          }
        `}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown
              className={`w-4 h-4 ${
                position.noShares > 0 ? "text-no" : "text-zinc-500"
              }`}
            />
            <span className="text-xs font-medium text-zinc-400">NO</span>
          </div>
          <div
            className={`text-xl font-bold ${
              position.noShares > 0 ? "text-no" : "text-zinc-600"
            }`}
          >
            {position.noShares.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">
            @ {position.avgNoPrice.toFixed(1)}¢ avg
          </div>
        </div>
      </div>

      {/* Value Summary */}
      <div className="bg-surface-2 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Total Invested</span>
          <span className="text-white font-medium">
            {formatSats(position.totalInvested)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Current Value</span>
          <span className="text-white font-medium">
            {formatSats(Math.round(totalCurrentValue))}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm border-t border-white/5 pt-2">
          <span className="text-zinc-400">Unrealized P&L</span>
          <span
            className={`font-medium ${
              isProfitable ? "text-green-400" : "text-red-400"
            }`}
          >
            {isProfitable ? "+" : ""}
            {formatSats(Math.round(unrealizedPnL))}
            <span className="text-xs ml-1">
              ({isProfitable ? "+" : ""}
              {pnlPercentage.toFixed(1)}%)
            </span>
          </span>
        </div>
      </div>

      {/* Potential Payouts */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between p-2 bg-yes/5 rounded-lg">
          <span className="text-zinc-500">If YES wins</span>
          <span className="text-yes font-medium">
            {formatSats(yesWinPayout)}
          </span>
        </div>
        <div className="flex items-center justify-between p-2 bg-no/5 rounded-lg">
          <span className="text-zinc-500">If NO wins</span>
          <span className="text-no font-medium">{formatSats(noWinPayout)}</span>
        </div>
      </div>

      {/* Resolved State */}
      {market.status === "Resolved" && market.resolution && (
        <div
          className={`
          mt-4 p-3 rounded-xl text-center
          ${
            market.resolution.outcome === "Yes"
              ? "bg-yes/20 border border-yes/30"
              : "bg-no/20 border border-no/30"
          }
        `}
        >
          <p className="text-sm font-medium text-white">
            Market resolved: {market.resolution.outcome}
          </p>
          <p
            className={`text-lg font-bold mt-1 ${
              market.resolution.outcome === "Yes" ? "text-yes" : "text-no"
            }`}
          >
            Payout:{" "}
            {formatSats(
              market.resolution.outcome === "Yes" ? yesWinPayout : noWinPayout
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

export function NoPositions() {
  return (
    <div className="bg-surface-1 border border-white/10 rounded-2xl p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
        <Coins className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">
        No Positions Yet
      </h3>
      <p className="text-zinc-400 text-sm mb-4">
        Start trading to see your positions here.
      </p>
      <Link href="/">
        <Button variant="primary" size="sm">
          Browse Markets
        </Button>
      </Link>
    </div>
  );
}
