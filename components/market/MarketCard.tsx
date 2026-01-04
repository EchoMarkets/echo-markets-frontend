"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, TrendingUp, Users } from "lucide-react";
import type { Market } from "@/types";
import { formatSats, formatTimeRemaining, getMarketStatus } from "@/lib/utils";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const status = getMarketStatus(market);

  return (
    <Link href={`/market/${market.id}`}>
      <motion.article
        className="card-hover p-6 h-full flex flex-col"
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {/* Status Badge */}
        <div className="flex items-center justify-between mb-4">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              market.status === "Active"
                ? "bg-green-500/20 text-green-400"
                : market.status === "Resolved"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {status.label}
          </span>
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimeRemaining(market.params.tradingDeadline)}
          </span>
        </div>

        {/* Question */}
        <h3 className="text-lg font-semibold mb-4 flex-1 line-clamp-2">
          {market.question}
        </h3>

        {/* Price Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-yes font-medium">YES {market.yesPrice}%</span>
            <span className="text-no font-medium">NO {market.noPrice}%</span>
          </div>
          <div className="h-3 rounded-full bg-surface-3 overflow-hidden flex">
            <motion.div
              className="h-full bg-linear-to-r from-yes to-yes-light"
              initial={{ width: 0 }}
              animate={{ width: `${market.yesPrice}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <motion.div
              className="h-full bg-linear-to-r from-no-dark to-no"
              initial={{ width: 0 }}
              animate={{ width: `${market.noPrice}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            <span>{formatSats(market.volume)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>
              {Math.floor((market.yesSupply + market.noSupply) / 1000)}K shares
            </span>
          </div>
        </div>

        {/* Resolution Outcome (if resolved) */}
        {market.status === "Resolved" && market.resolution && (
          <div
            className={`mt-4 p-3 rounded-lg text-center font-medium ${
              market.resolution.outcome === "Yes"
                ? "bg-yes/20 text-yes"
                : market.resolution.outcome === "No"
                ? "bg-no/20 text-no"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            Resolved: {market.resolution.outcome}
          </div>
        )}
      </motion.article>
    </Link>
  );
}
