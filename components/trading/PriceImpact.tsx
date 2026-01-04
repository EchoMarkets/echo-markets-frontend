"use client";

import { AlertTriangle, Info } from "lucide-react";

interface PriceImpactProps {
  impact: number; // Percentage impact (0-100)
  showLabel?: boolean;
}

export function PriceImpact({ impact, showLabel = true }: PriceImpactProps) {
  // Determine severity
  const severity = getSeverity(impact);

  return (
    <div
      className={`
      flex items-center justify-between text-sm p-2 rounded-lg
      ${severity.bgClass}
    `}
    >
      <div className="flex items-center gap-2">
        {severity.level === "high" ? (
          <AlertTriangle className={`w-4 h-4 ${severity.iconClass}`} />
        ) : (
          <Info className={`w-4 h-4 ${severity.iconClass}`} />
        )}
        {showLabel && <span className={severity.textClass}>Price Impact</span>}
      </div>
      <span className={`font-medium ${severity.valueClass}`}>
        {impact < 0.01 ? "<0.01%" : `${impact.toFixed(2)}%`}
      </span>
    </div>
  );
}

interface Severity {
  level: "low" | "medium" | "high";
  bgClass: string;
  textClass: string;
  valueClass: string;
  iconClass: string;
}

function getSeverity(impact: number): Severity {
  if (impact < 1) {
    return {
      level: "low",
      bgClass: "bg-green-500/10",
      textClass: "text-zinc-400",
      valueClass: "text-green-400",
      iconClass: "text-green-500",
    };
  }

  if (impact < 5) {
    return {
      level: "medium",
      bgClass: "bg-yellow-500/10",
      textClass: "text-zinc-400",
      valueClass: "text-yellow-400",
      iconClass: "text-yellow-500",
    };
  }

  return {
    level: "high",
    bgClass: "bg-red-500/10",
    textClass: "text-zinc-400",
    valueClass: "text-red-400",
    iconClass: "text-red-500",
  };
}

// =============================================================================
// EXTENDED PRICE IMPACT DISPLAY
// =============================================================================

interface PriceImpactDetailsProps {
  currentPrice: number;
  newPrice: number;
  impact: number;
  outcome: "Yes" | "No";
}

export function PriceImpactDetails({
  currentPrice,
  newPrice,
  impact,
  outcome,
}: PriceImpactDetailsProps) {
  const severity = getSeverity(impact);
  const isYes = outcome === "Yes";

  return (
    <div className={`rounded-xl p-4 ${severity.bgClass}`}>
      <div className="flex items-center gap-2 mb-3">
        {severity.level === "high" ? (
          <AlertTriangle className={`w-5 h-5 ${severity.iconClass}`} />
        ) : (
          <Info className={`w-5 h-5 ${severity.iconClass}`} />
        )}
        <span className="font-medium text-white">Price Impact</span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-zinc-500 mb-1">Current</div>
          <div className={`font-semibold ${isYes ? "text-yes" : "text-no"}`}>
            {currentPrice.toFixed(1)}¢
          </div>
        </div>

        <div className="text-center">
          <div className="text-zinc-500 mb-1">After Trade</div>
          <div className={`font-semibold ${isYes ? "text-yes" : "text-no"}`}>
            {newPrice.toFixed(1)}¢
          </div>
        </div>

        <div className="text-right">
          <div className="text-zinc-500 mb-1">Impact</div>
          <div className={`font-semibold ${severity.valueClass}`}>
            {impact < 0.01 ? "<0.01%" : `${impact.toFixed(2)}%`}
          </div>
        </div>
      </div>

      {severity.level === "high" && (
        <div className="mt-3 pt-3 border-t border-red-500/20">
          <p className="text-xs text-red-400">
            ⚠️ High price impact! Consider reducing your trade size.
          </p>
        </div>
      )}
    </div>
  );
}
