"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, TrendingUp, Clock, CheckCircle, Filter } from "lucide-react";
import {
  useMarketsStore,
  useWalletStore,
  useFilteredMarkets,
  usePortfolioStore,
} from "@/lib/store";
import { MarketCard } from "@/components/market/MarketCard";
import { Button } from "@/components/ui/Button";
import { formatSats } from "@/lib/utils";
import type { Market, MarketPosition } from "@/types";

// Demo markets for testing
const DEMO_MARKETS: Market[] = [
  {
    id: "1",
    questionHash: "abc123",
    question: "Will Bitcoin reach $150,000 by end of 2026?",
    description: "BTC/USD price on major exchanges must exceed $150,000",
    params: {
      tradingDeadline: Math.floor(Date.now() / 1000) + 86400 * 30,
      resolutionDeadline: Math.floor(Date.now() / 1000) + 86400 * 35,
      feeBps: 100,
      minBet: 10000,
    },
    status: "Active",
    yesSupply: 5000000,
    noSupply: 3000000,
    maxSupply: 1000000000000,
    fees: 80000,
    creator: "02abcd...",
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 5,
    yesPrice: 62,
    noPrice: 38,
    volume: 8000000,
    liquidity: 8000000,
  },
  {
    id: "2",
    questionHash: "def456",
    question: "Will Ethereum flip Bitcoin market cap in 2026?",
    description: "ETH market cap must exceed BTC market cap",
    params: {
      tradingDeadline: Math.floor(Date.now() / 1000) + 86400 * 60,
      resolutionDeadline: Math.floor(Date.now() / 1000) + 86400 * 65,
      feeBps: 100,
      minBet: 10000,
    },
    status: "Active",
    yesSupply: 2000000,
    noSupply: 8000000,
    maxSupply: 1000000000000,
    fees: 100000,
    creator: "02efgh...",
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 10,
    yesPrice: 20,
    noPrice: 80,
    volume: 10000000,
    liquidity: 10000000,
  },
  {
    id: "3",
    questionHash: "ghi789",
    question: "Will there be a Bitcoin ETF approved in Europe by Q2 2026?",
    params: {
      tradingDeadline: Math.floor(Date.now() / 1000) + 86400 * 45,
      resolutionDeadline: Math.floor(Date.now() / 1000) + 86400 * 50,
      feeBps: 100,
      minBet: 10000,
    },
    status: "Active",
    yesSupply: 4000000,
    noSupply: 4000000,
    maxSupply: 1000000000000,
    fees: 80000,
    creator: "02ijkl...",
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 3,
    yesPrice: 50,
    noPrice: 50,
    volume: 8000000,
    liquidity: 8000000,
  },
];

// Mock wallet address for testing
const MOCK_WALLET_ADDRESS = "tb1pv68ul79qt23mj8dlh2a9y4gwxpa50e2w63yxwxf99s0f6egk2cvqx0jdle";

// Mock positions for the test wallet
const MOCK_POSITIONS: MarketPosition[] = [
  {
    marketId: "1", // Bitcoin $150k market
    yesTokens: 500000, // 500k YES tokens
    noTokens: 200000, // 200k NO tokens
    avgYesCost: 60, // Bought YES at 60%
    avgNoCost: 40, // Bought NO at 40%
  },
  {
    marketId: "2", // Ethereum flip market
    yesTokens: 100000, // 100k YES tokens
    noTokens: 800000, // 800k NO tokens (betting against flip)
    avgYesCost: 25, // Bought YES at 25%
    avgNoCost: 75, // Bought NO at 75%
  },
  {
    marketId: "3", // Bitcoin ETF Europe market
    yesTokens: 300000, // 300k YES tokens
    noTokens: 300000, // 300k NO tokens (neutral position)
    avgYesCost: 50, // Bought YES at 50%
    avgNoCost: 50, // Bought NO at 50%
  },
];

export default function HomePage() {
  const { markets, setMarkets, filter, setFilter } = useMarketsStore();
  const { wallet } = useWalletStore();
  const { positions, setPositions } = usePortfolioStore();
  const filteredMarkets = useFilteredMarkets();

  // Load demo markets on mount
  useEffect(() => {
    if (markets.length === 0) {
      setMarkets(DEMO_MARKETS);
    }
  }, [markets.length, setMarkets]);

  // Load mock positions for the test wallet address
  useEffect(() => {
    if (wallet?.address === MOCK_WALLET_ADDRESS && positions.length === 0) {
      console.log("Loading mock positions for test wallet:", MOCK_WALLET_ADDRESS);
      setPositions(MOCK_POSITIONS);
    }
  }, [wallet?.address, positions.length, setPositions]);

  const stats = {
    totalVolume: markets.reduce((sum, m) => sum + m.volume, 0),
    activeMarkets: markets.filter((m) => m.status === "Active").length,
    totalLiquidity: markets.reduce((sum, m) => sum + m.liquidity, 0),
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          <span className="text-gradient">Prediction Markets</span>
          <br />
          <span className="text-white">on Bitcoin</span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          Trade on future outcomes. Powered by Charms protocol on Bitcoin
          Testnet4.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto mb-8">
          <div className="card p-4">
            <div className="text-2xl font-bold text-gradient">
              {formatSats(stats.totalVolume)}
            </div>
            <div className="text-sm text-zinc-500">Total Volume</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-white">
              {stats.activeMarkets}
            </div>
            <div className="text-sm text-zinc-500">Active Markets</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-white">
              {formatSats(stats.totalLiquidity)}
            </div>
            <div className="text-sm text-zinc-500">Liquidity</div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-4 justify-center">
          <Link href="/create">
            <Button variant="primary" size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Create Market
            </Button>
          </Link>
          {!wallet && (
            <Link href="/wallet">
              <Button variant="secondary" size="lg">
                Connect Wallet
              </Button>
            </Link>
          )}
        </div>
      </motion.section>

      {/* Filters */}
      <section className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["all", "active", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? "bg-accent text-black"
                  : "bg-surface-2 text-zinc-400 hover:text-white"
              }`}
            >
              {f === "all" && <TrendingUp className="w-4 h-4 inline mr-1" />}
              {f === "active" && <Clock className="w-4 h-4 inline mr-1" />}
              {f === "resolved" && (
                <CheckCircle className="w-4 h-4 inline mr-1" />
              )}
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <button className="p-2 bg-surface-2 rounded-lg text-zinc-400 hover:text-white">
          <Filter className="w-5 h-5" />
        </button>
      </section>

      {/* Markets Grid */}
      <section>
        {filteredMarkets.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔮</div>
            <h3 className="text-xl font-semibold mb-2">No markets found</h3>
            <p className="text-zinc-500 mb-6">
              Be the first to create a prediction market!
            </p>
            <Link href="/create">
              <Button variant="primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Market
              </Button>
            </Link>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {filteredMarkets.map((market, index) => (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <MarketCard market={market} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Info Section */}
      <section className="card p-8 mt-12">
        <h2 className="text-2xl font-bold mb-6">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            {
              step: "1",
              title: "Fund Wallet",
              description: "Get testnet4 BTC from a faucet",
            },
            {
              step: "2",
              title: "Mint Shares",
              description: "Deposit BTC to get YES + NO tokens",
            },
            {
              step: "3",
              title: "Trade",
              description: "Buy/sell the outcome you believe in",
            },
            {
              step: "4",
              title: "Redeem",
              description: "Cash out winning tokens after resolution",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-12 h-12 rounded-full bg-accent/20 text-accent font-bold text-xl flex items-center justify-center mx-auto mb-3">
                {item.step}
              </div>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-zinc-500">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
