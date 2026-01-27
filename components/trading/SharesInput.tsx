"use client";

import { useState, useEffect, useRef } from "react";
import { Coins } from "lucide-react";
import { formatSats } from "@/lib/utils";

interface SharesInputProps {
  value: number;
  onChange: (value: number) => void;
  maxAmount: number;
  disabled?: boolean;
  label?: string;
  minAmount?: number;
  placeholder?: string;
}

export function SharesInput({
  value,
  onChange,
  maxAmount,
  disabled = false,
  label = "Amount",
  minAmount = 1000,
  placeholder = "0",
}: SharesInputProps) {
  const [inputValue, setInputValue] = useState(
    value > 0 ? value.toString() : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (value === 0) {
      setInputValue("");
    } else {
      setInputValue((prev) => {
        const prevNum = parseInt(prev) || 0;
        return prevNum !== value ? value.toString() : prev;
      });
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setInputValue(raw);

    const numValue = parseInt(raw) || 0;
    onChange(numValue);
  };

  const handleMax = () => {
    setInputValue(maxAmount.toString());
    onChange(maxAmount);
    inputRef.current?.focus();
  };

  const handlePreset = (percentage: number) => {
    const amount = Math.floor(maxAmount * percentage);
    setInputValue(amount.toString());
    onChange(amount);
  };

  const numericValue = parseInt(inputValue) || 0;
  const isValid = numericValue === 0 || numericValue >= minAmount;
  const exceedsMax = numericValue > maxAmount;

  return (
    <div className="space-y-2">
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-400">{label}</label>
        <span className="text-xs text-zinc-500">
          Available: {formatSats(maxAmount)}
        </span>
      </div>

      {/* Input Container */}
      <div
        className={`
        relative flex items-center bg-surface-2 rounded-xl border transition-colors overflow-hidden
        ${disabled ? "opacity-50" : ""}
        ${
          exceedsMax
            ? "border-red-500/50"
            : "border-white/10 focus-within:border-accent"
        }
      `}
      >
        {/* Icon */}
        <div className="pl-4 flex-shrink-0">
          <Coins className="w-5 h-5 text-zinc-500" />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className="
            flex-1 min-w-0 bg-transparent px-3 py-4 text-lg font-medium text-white
            placeholder-zinc-600 focus:outline-none
          "
        />

        {/* Suffix and Max Button Container */}
        <div className="flex items-center gap-2 pr-4 flex-shrink-0">
          {/* Suffix */}
          <span className="text-sm text-zinc-500 whitespace-nowrap">sats</span>

          {/* Max Button */}
          <button
            onClick={handleMax}
            disabled={disabled || maxAmount === 0}
            className="
              px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap
              bg-accent/20 text-accent hover:bg-accent/30
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            MAX
          </button>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="flex gap-2">
        {[0.25, 0.5, 0.75].map((pct) => (
          <button
            key={pct}
            onClick={() => handlePreset(pct)}
            disabled={disabled || maxAmount === 0}
            className="
              flex-1 py-1.5 text-xs font-medium rounded-lg
              bg-surface-2 text-zinc-400 hover:text-white hover:bg-surface-3
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {pct * 100}%
          </button>
        ))}
      </div>

      {/* Validation Messages */}
      {exceedsMax && (
        <p className="text-xs text-red-400">Amount exceeds available balance</p>
      )}
      {!isValid && numericValue > 0 && (
        <p className="text-xs text-yellow-400">
          Minimum amount: {formatSats(minAmount)}
        </p>
      )}
    </div>
  );
}
