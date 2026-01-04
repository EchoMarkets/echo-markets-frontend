"use client";

// import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  // ExternalLink,
  BarChart3,
} from "lucide-react";
import {
  useWalletStore,
  usePortfolioStore,
  useMarketsStore,
} from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { formatSats, formatAddress } from "@/lib/utils";

export default function PortfolioPage() {
  const { wallet } = useWalletStore();
  const { positions, transactions } = usePortfolioStore();
  const { markets } = useMarketsStore();

  if (!wallet) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <Wallet className="w-16 h-16 text-zinc-600 mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-4">Connect Wallet</h1>
        <p className="text-zinc-400 mb-6">
          Connect your wallet to view your portfolio
        </p>
        <Link href="/wallet">
          <Button variant="primary">Connect Wallet</Button>
        </Link>
      </div>
    );
  }

  // Map positions from store to display format with P&L calculations
  const positionsWithMarket = positions
    .map((position) => {
      const market = markets.find((m) => m.id === position.marketId);
      if (!market) return null;

      // Calculate current value and P&L
      const yesValue = (position.yesTokens * market.yesPrice) / 100;
      const noValue = (position.noTokens * market.noPrice) / 100;
      const currentValue = yesValue + noValue;

      const yesCost = (position.yesTokens * position.avgYesCost) / 100;
      const noCost = (position.noTokens * position.avgNoCost) / 100;
      const costBasis = yesCost + noCost;

      const pnl = currentValue - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

      // Determine primary position (YES or NO) based on which has more tokens
      const primaryOutcome =
        position.yesTokens > position.noTokens ? "Yes" : "No";
      const avgCost =
        primaryOutcome === "Yes" ? position.avgYesCost : position.avgNoCost;
      const currentPrice =
        primaryOutcome === "Yes" ? market.yesPrice : market.noPrice;

      return {
        marketId: position.marketId,
        market,
        yesTokens: position.yesTokens,
        noTokens: position.noTokens,
        avgCost,
        currentPrice,
        pnl,
        pnlPercent,
        currentValue,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const totalValue = positionsWithMarket.reduce(
    (sum, pos) => sum + pos.currentValue,
    0
  );
  const totalPnl = positionsWithMarket.reduce((sum, pos) => sum + pos.pnl, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Portfolio Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-8"
      >
        <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-surface-2">
            <div className="text-2xl font-bold text-gradient">
              {formatSats(wallet.balance)}
            </div>
            <div className="text-sm text-zinc-500">BTC Balance</div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2">
            <div className="text-2xl font-bold">
              {formatSats(Math.floor(totalValue))}
            </div>
            <div className="text-sm text-zinc-500">Position Value</div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2">
            <div
              className={`text-2xl font-bold ${
                totalPnl >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {totalPnl >= 0 ? "+" : ""}
              {formatSats(totalPnl)}
            </div>
            <div className="text-sm text-zinc-500">Total P&L</div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2">
            <div className="text-2xl font-bold">
              {positionsWithMarket.length}
            </div>
            <div className="text-sm text-zinc-500">Active Positions</div>
          </div>
        </div>
      </motion.div>

      {/* Positions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Positions</h2>

        {positionsWithMarket.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">No positions yet</p>
            <Link href="/">
              <Button variant="secondary">Browse Markets</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {positionsWithMarket.map((position) => (
              <Link
                key={position.marketId}
                href={`/market/${position.marketId}`}
              >
                <motion.div
                  className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer"
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium line-clamp-1">
                        {position.market?.question}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full ${
                            position.yesTokens > 0
                              ? "bg-yes/20 text-yes"
                              : "bg-no/20 text-no"
                          }`}
                        >
                          {position.yesTokens > 0 ? "YES" : "NO"}
                        </span>
                        <span className="text-zinc-400">
                          {(
                            position.yesTokens + position.noTokens
                          ).toLocaleString()}{" "}
                          shares
                        </span>
                        <span className="text-zinc-400">
                          @ {position.avgCost}%
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-medium">
                        {formatSats(
                          ((position.yesTokens + position.noTokens) *
                            position.currentPrice) /
                            100
                        )}
                      </div>
                      <div
                        className={`text-sm flex items-center gap-1 justify-end ${
                          position.pnl >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {position.pnl >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {position.pnlPercent >= 0 ? "+" : ""}
                        {position.pnlPercent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>

        {transactions.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.txid}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-2"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === "mint"
                        ? "bg-green-500/20"
                        : tx.type === "redeem"
                        ? "bg-blue-500/20"
                        : "bg-zinc-500/20"
                    }`}
                  >
                    <span className="text-lg">
                      {tx.type === "mint"
                        ? "📈"
                        : tx.type === "redeem"
                        ? "💰"
                        : tx.type === "trade"
                        ? "🔄"
                        : "📝"}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium capitalize">{tx.type}</div>
                    <div className="text-sm text-zinc-500">
                      {formatAddress(tx.txid)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {tx.amount && (
                    <div className="font-medium">
                      {tx.type === "mint" ? "-" : "+"}
                      {formatSats(tx.amount)}
                    </div>
                  )}
                  <div
                    className={`text-sm ${
                      tx.status === "confirmed"
                        ? "text-green-400"
                        : tx.status === "pending"
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}
                  >
                    {tx.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
