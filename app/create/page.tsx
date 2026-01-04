"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Wallet,
  Calendar,
  Percent,
  FileText,
} from "lucide-react";
import { useWalletStore, useUIStore } from "@/lib/store";
import { useCharms } from "@/lib/useCharms";
import { Button } from "@/components/ui/Button";
import { formatSats } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

interface FormData {
  question: string;
  description: string;
  tradingDeadline: string;
  resolutionDeadline: string;
  feeBps: number;
  minBet: number;
  maxSupply: number;
}

const STEPS = [
  { id: 1, title: "Question", icon: FileText },
  { id: 2, title: "Deadlines", icon: Calendar },
  { id: 3, title: "Parameters", icon: Percent },
  { id: 4, title: "Review", icon: Check },
];

export default function CreateMarketPage() {
  const router = useRouter();
  const { wallet } = useWalletStore();
  const { addToast } = useUIStore();
  const { createMarket, isLoading: isCharmsLoading } = useCharms();

  const [step, setStep] = useState<Step>(1);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    question: "",
    description: "",
    tradingDeadline: "",
    resolutionDeadline: "",
    feeBps: 100,
    minBet: 10000,
    maxSupply: 1000000000000,
  });

  const updateForm = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.question.length >= 10;
      case 2:
        return formData.tradingDeadline && formData.resolutionDeadline;
      case 3:
        return formData.feeBps >= 0 && formData.minBet > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    if (!wallet) return;

    setIsCreating(true);

    try {
      const tradingDeadline = Math.floor(
        new Date(formData.tradingDeadline).getTime() / 1000
      );
      const resolutionDeadline = Math.floor(
        new Date(formData.resolutionDeadline).getTime() / 1000
      );

      const marketId = await createMarket({
        question: formData.question,
        description: formData.description,
        tradingDeadline,
        resolutionDeadline,
        feeBps: formData.feeBps,
        minBet: formData.minBet,
        maxSupply: formData.maxSupply,
      });

      router.push(`/market/${marketId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create market";
      addToast({
        type: "error",
        title: "Creation Failed",
        message: message || "Failed to create market. Please try again.",
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!wallet) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <Wallet className="w-16 h-16 text-zinc-600 mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-4">Wallet Required</h1>
        <p className="text-zinc-400 mb-6">
          Connect your wallet to create a prediction market
        </p>
        <Link href="/wallet">
          <Button variant="primary">Connect Wallet</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back Button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </Link>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, index) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isCompleted = step > s.id;

            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-accent text-black"
                      : isCompleted
                      ? "bg-green-500/20 text-green-400"
                      : "bg-surface-2 text-zinc-500"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline font-medium">
                    {s.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-8 h-0.5 mx-2 ${
                      isCompleted ? "bg-green-500" : "bg-surface-3"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Steps */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="card p-8"
      >
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Market Question</h2>
              <p className="text-zinc-400">
                Write a clear yes/no question that can be resolved objectively
              </p>
            </div>

            <div>
              <label className="label">Question *</label>
              <input
                type="text"
                value={formData.question}
                onChange={(e) => updateForm({ question: e.target.value })}
                placeholder="Will Bitcoin reach $150,000 by end of 2025?"
                className="input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                {formData.question.length}/200 characters (min 10)
              </p>
            </div>

            <div>
              <label className="label">Description (Optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Add more context about how this market will be resolved..."
                rows={4}
                className="input resize-none"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Trading Deadlines</h2>
              <p className="text-zinc-400">
                Set when trading ends and when the market can be resolved
              </p>
            </div>

            <div>
              <label className="label">Trading Deadline *</label>
              <input
                type="datetime-local"
                value={formData.tradingDeadline}
                onChange={(e) =>
                  updateForm({ tradingDeadline: e.target.value })
                }
                className="input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Users can trade until this time
              </p>
            </div>

            <div>
              <label className="label">Resolution Deadline *</label>
              <input
                type="datetime-local"
                value={formData.resolutionDeadline}
                onChange={(e) =>
                  updateForm({ resolutionDeadline: e.target.value })
                }
                min={formData.tradingDeadline}
                className="input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Market can be resolved after this time
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Market Parameters</h2>
              <p className="text-zinc-400">
                Configure fees and limits for your market
              </p>
            </div>

            <div>
              <label className="label">Trading Fee (%)</label>
              <input
                type="number"
                value={formData.feeBps / 100}
                onChange={(e) =>
                  updateForm({ feeBps: parseFloat(e.target.value) * 100 })
                }
                min={0}
                max={10}
                step={0.1}
                className="input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Fee charged on each mint (goes to market creator)
              </p>
            </div>

            <div>
              <label className="label">Minimum Bet (sats)</label>
              <input
                type="number"
                value={formData.minBet}
                onChange={(e) =>
                  updateForm({ minBet: parseInt(e.target.value) })
                }
                min={1000}
                className="input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Minimum amount to mint shares
              </p>
            </div>

            <div>
              <label className="label">Max Supply</label>
              <select
                value={formData.maxSupply}
                onChange={(e) =>
                  updateForm({ maxSupply: parseInt(e.target.value) })
                }
                className="input"
              >
                <option value={1000000000}>1B (1 billion)</option>
                <option value={1000000000000}>1T (1 trillion)</option>
                <option value={1000000000000000}>1Q (1 quadrillion)</option>
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                Maximum total supply of YES + NO tokens
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Review & Create</h2>
              <p className="text-zinc-400">
                Confirm your market details before creating
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface-2">
                <label className="text-xs text-zinc-500">Question</label>
                <p className="font-medium">{formData.question}</p>
              </div>

              {formData.description && (
                <div className="p-4 rounded-xl bg-surface-2">
                  <label className="text-xs text-zinc-500">Description</label>
                  <p className="text-sm text-zinc-300">
                    {formData.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-surface-2">
                  <label className="text-xs text-zinc-500">Trading Ends</label>
                  <p className="font-medium">
                    {new Date(formData.tradingDeadline).toLocaleDateString()}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-surface-2">
                  <label className="text-xs text-zinc-500">
                    Resolution After
                  </label>
                  <p className="font-medium">
                    {new Date(formData.resolutionDeadline).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-surface-2">
                  <label className="text-xs text-zinc-500">Fee</label>
                  <p className="font-medium">{formData.feeBps / 100}%</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-2">
                  <label className="text-xs text-zinc-500">Min Bet</label>
                  <p className="font-medium">{formatSats(formData.minBet)}</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm text-yellow-400">
                ⚠️ Creating a market requires a Bitcoin transaction. Make sure
                you have enough testnet BTC.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-white/5">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s - 1) as Step)}
            disabled={step === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {step < 4 ? (
            <Button
              variant="primary"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isCreating || isCharmsLoading}
              disabled={!canProceed()}
            >
              Create Market
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
