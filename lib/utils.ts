import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { sha256 as sha256Hash } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// =============================================================================
// STYLING
// =============================================================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =============================================================================
// FORMATTING
// =============================================================================

export function formatSats(sats: number): string {
  if (sats >= 100_000_000) {
    return `${(sats / 100_000_000).toFixed(4)} BTC`;
  }
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(2)}M sats`;
  }
  if (sats >= 1_000) {
    return `${(sats / 1_000).toFixed(1)}K sats`;
  }
  return `${sats.toLocaleString()} sats`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatAddress(address: string, chars = 6): string {
  if (!address) return "";
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeRemaining(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = deadline - now;

  if (remaining <= 0) return "Ended";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// =============================================================================
// CALCULATIONS
// =============================================================================

export function calculateFee(amount: number, feeBps: number): number {
  return Math.floor((amount * feeBps) / 10000);
}

export function calculateShares(amount: number, feeBps: number): number {
  const fee = calculateFee(amount, feeBps);
  return amount - fee;
}

export function calculatePrice(
  yesSupply: number,
  noSupply: number
): { yes: number; no: number } {
  const total = yesSupply + noSupply;
  if (total === 0) return { yes: 50, no: 50 };

  // Simple price based on supply ratio
  // In a real AMM, this would be more sophisticated
  const yes = Math.round((noSupply / total) * 100);
  const no = 100 - yes;

  return { yes, no };
}

export function calculatePotentialPayout(
  outcome: "Yes" | "No",
  tokens: number,
  currentPrice: number
): number {
  // Each token pays out 1 sat if it wins
  // Cost was tokens * (currentPrice / 100)
  // Profit = tokens - cost
  const cost = tokens * (currentPrice / 100);
  return tokens - cost;
}

// =============================================================================
// VALIDATION
// =============================================================================

export function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  return words.length === 12 || words.length === 24;
}

export function isValidAddress(address: string): boolean {
  // Basic testnet4 address validation
  return (
    address.startsWith("tb1") ||
    address.startsWith("n") ||
    address.startsWith("m")
  );
}

export function isValidHex(hex: string): boolean {
  return /^[0-9a-fA-F]+$/.test(hex);
}

// =============================================================================
// CRYPTO HELPERS (using @noble/hashes)
// =============================================================================

/**
 * SHA256 hash - synchronous version using @noble/hashes
 */
export function sha256(data: string): string {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hash = sha256Hash(dataBuffer);
  return bytesToHex(hash);
}

/**
 * SHA256 hash - async version (for compatibility)
 */
export async function sha256Async(data: string): Promise<string> {
  return sha256(data);
}

/**
 * SHA256 hash for bytes
 */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256Hash(data);
}

/**
 * Double SHA256 (Bitcoin standard)
 */
export function hash256(data: Uint8Array): Uint8Array {
  return sha256Hash(sha256Hash(data));
}

export function generateRandomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// =============================================================================
// MARKET HELPERS
// =============================================================================

export function getMarketStatus(market: {
  status: string;
  params: { tradingDeadline: number; resolutionDeadline: number };
}): {
  label: string;
  color: string;
  canTrade: boolean;
  canResolve: boolean;
} {
  const now = Math.floor(Date.now() / 1000);

  switch (market.status) {
    case "Active":
      if (now >= market.params.tradingDeadline) {
        return {
          label: "Trading Closed",
          color: "text-yellow-500",
          canTrade: false,
          canResolve: now >= market.params.resolutionDeadline,
        };
      }
      return {
        label: "Active",
        color: "text-green-500",
        canTrade: true,
        canResolve: false,
      };
    case "TradingClosed":
      return {
        label: "Awaiting Resolution",
        color: "text-yellow-500",
        canTrade: false,
        canResolve: now >= market.params.resolutionDeadline,
      };
    case "Resolved":
      return {
        label: "Resolved",
        color: "text-blue-500",
        canTrade: false,
        canResolve: false,
      };
    case "Cancelled":
      return {
        label: "Cancelled",
        color: "text-red-500",
        canTrade: false,
        canResolve: false,
      };
    default:
      return {
        label: "Unknown",
        color: "text-gray-500",
        canTrade: false,
        canResolve: false,
      };
  }
}

// =============================================================================
// DEBOUNCE & THROTTLE
// =============================================================================

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// =============================================================================
// LOCAL STORAGE
// =============================================================================

export function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;

  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error("Failed to save to localStorage");
  }
}

export function removeFromStorage(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}
