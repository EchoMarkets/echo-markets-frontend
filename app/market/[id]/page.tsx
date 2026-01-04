"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Clock } from "lucide-react";
import { useMarketsStore } from "@/lib/store";
import { useCharms } from "@/lib/useCharms";
import { Button } from "@/components/ui/Button";
import { TradingPanel } from "@/components/trading";
import {
  formatSats,
  formatTimeRemaining,
  formatDate,
  getMarketStatus,
} from "@/lib/utils";

export default function MarketDetailPage() {
  const params = useParams();
  const { markets } = useMarketsStore();
  const { mintShares } = useCharms();

  const market = markets.find((m) => m.id === params.id);

  if (!market) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-4">Market Not Found</h1>
        <Link href="/">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Markets
          </Button>
        </Link>
      </div>
    );
  }

  const status = getMarketStatus(market);

  // Note: mintShares() mints BOTH YES and NO tokens together (that's how the Charms
  // prediction market works). The `outcome` parameter from TradingPanel is ignored
  // for now, as the protocol always mints equal amounts of both token types.
  const handleTrade = async (outcome: "Yes" | "No", amount: number) => {
    if (!market) return;

    try {
      await mintShares({
        marketId: market.id,
        amount: amount,
      });
    } catch (error) {
      // Error handling is done by useCharms hook (shows toast)
      // Re-throw to let TradingPanel handle it if needed
      throw error;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Market Info */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-6"
          >
            {/* Status */}
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  market.status === "Active"
                    ? "bg-green-500/20 text-green-400"
                    : market.status === "Resolved"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                {status.label}
              </span>
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTimeRemaining(market.params.tradingDeadline)}
              </span>
            </div>

            {/* Question */}
            <h1 className="text-2xl font-bold mb-4">{market.question}</h1>

            {market.description && (
              <p className="text-zinc-400 mb-6">{market.description}</p>
            )}

            {/* Price Display */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-yes/10 border border-yes/20">
                <div className="text-3xl font-bold text-yes mb-1">
                  {market.yesPrice}%
                </div>
                <div className="text-sm text-zinc-400">YES Price</div>
              </div>
              <div className="p-4 rounded-xl bg-no/10 border border-no/20">
                <div className="text-3xl font-bold text-no mb-1">
                  {market.noPrice}%
                </div>
                <div className="text-sm text-zinc-400">NO Price</div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold">
                  {formatSats(market.volume)}
                </div>
                <div className="text-sm text-zinc-500">Volume</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">
                  {formatSats(market.liquidity)}
                </div>
                <div className="text-sm text-zinc-500">Liquidity</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">
                  {((market.yesSupply + market.noSupply) / 1000000).toFixed(1)}M
                </div>
                <div className="text-sm text-zinc-500">Shares</div>
              </div>
            </div>
          </motion.div>

          {/* Market Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-6"
          >
            <h2 className="text-lg font-semibold mb-4">Market Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Trading Deadline</span>
                <span>{formatDate(market.params.tradingDeadline)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Resolution Deadline</span>
                <span>{formatDate(market.params.resolutionDeadline)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Fee</span>
                <span>{market.params.feeBps / 100}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Min Bet</span>
                <span>{formatSats(market.params.minBet)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Creator</span>
                <span className="font-mono text-xs">{market.creator}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Trading Panel */}
        <div className="lg:col-span-1">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="sticky top-24"
          >
            <TradingPanel market={market} onTrade={handleTrade} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
