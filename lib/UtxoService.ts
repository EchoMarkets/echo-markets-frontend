/**
 * UtxoService - UTXO management
 *
 * Features:
 * - Protected UTXO filtering (Ordinals, Runes, rare sats)
 * - Multi-address scanning (24 addresses)
 * - UTXO enrichment with signing data
 * - Rate-limited API calls
 *
 * Based on patterns from CharmsDev/bro:
 * - protected-values.js
 * - WalletUtxoScanner.js
 * - UtxoMonitorService.js
 */

import type { UTXO } from "@/types";
import type { ExtendedAddresses, TaprootKeyData } from "./WalletService";

// =============================================================================
// PROTECTED VALUES - Prevent spending digital assets
// =============================================================================

/**
 * UTXO values that indicate digital assets (Ordinals, Runes, etc.)
 * These should NOT be spent in regular transactions
 */
export const PROTECTED_VALUES = {
  TAPROOT_DUST: 330, // Taproot dust limit
  MINING_OUTPUT: 333, // BRO turbomining spendable outputs
  ORDINALS_DUST: 546, // Ordinals/Inscriptions/Runes minimum (Bitcoin dust)
  LUCKY_SATS: 777, // Lucky/rare sats collectible
  BRC20_SMALL: 1000, // BRC-20 & Ordinals small transfers
  ORDINALS_LARGE: 10000, // Large inscriptions (0.0001 BTC)
} as const;

export const PROTECTED_VALUES_SET = new Set<number>(
  Object.values(PROTECTED_VALUES)
);

/**
 * Check if a UTXO value indicates a protected digital asset
 */
export function isProtectedValue(value: number): boolean {
  return PROTECTED_VALUES_SET.has(value);
}

/**
 * Get human-readable reason for UTXO protection
 */
export function getProtectionReason(value: number): string | null {
  switch (value) {
    case PROTECTED_VALUES.TAPROOT_DUST:
      return "Taproot dust limit";
    case PROTECTED_VALUES.MINING_OUTPUT:
      return "Mining spendable output";
    case PROTECTED_VALUES.ORDINALS_DUST:
      return "Possible Ordinal/Inscription/Rune";
    case PROTECTED_VALUES.LUCKY_SATS:
      return "Lucky/rare sats collectible";
    case PROTECTED_VALUES.BRC20_SMALL:
      return "Possible BRC-20 token";
    case PROTECTED_VALUES.ORDINALS_LARGE:
      return "Possible large inscription";
    default:
      return null;
  }
}

/**
 * Filter out protected UTXOs from a list
 */
export function filterProtectedUtxos<T extends { value: number }>(
  utxos: T[]
): T[] {
  return utxos.filter((utxo) => !isProtectedValue(utxo.value));
}

// =============================================================================
// TYPES
// =============================================================================

export interface EnrichedUTXO extends UTXO {
  address: string;
  addressType: "recipient" | "change";
  chain: 0 | 1;
  addressIndex: number;
  derivationPath: string;
  privateKey: string;
  tweakedPrivateKey: string;
  internalPubkey: string;
}

export interface ScanResult {
  utxos: EnrichedUTXO[];
  totalValue: number;
  protectedCount: number;
  scannedAddresses: number;
  errors: ScanError[];
}

export interface ScanError {
  address: string;
  type: "recipient" | "change";
  error: string;
}

export interface UTXOSelection {
  selected: EnrichedUTXO[];
  total: number;
  fee: number;
  change: number;
}

// =============================================================================
// MEMPOOL API
// =============================================================================

const MEMPOOL_API = "https://mempool.space/testnet4/api";
const REQUEST_DELAY_MS = 150; // Delay between requests to avoid rate limiting

interface MempoolUTXOResponse {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value: number;
}

/**
 * Fetch UTXOs for a single address from mempool.space
 */
async function fetchAddressUtxos(
  address: string
): Promise<MempoolUTXOResponse[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch UTXOs for ${address}: ${response.statusText}`
    );
  }
  return response.json();
}

/**
 * Simple delay utility for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// UTXO SERVICE CLASS
// =============================================================================

export class UtxoService {
  private includeProtected: boolean;
  private minValue: number;

  constructor(options: { includeProtected?: boolean; minValue?: number } = {}) {
    this.includeProtected = options.includeProtected ?? false;
    this.minValue = options.minValue ?? 1000; // Default minimum 1000 sats
  }

  // ===========================================================================
  // SINGLE ADDRESS SCANNING
  // ===========================================================================

  /**
   * Fetch and filter UTXOs for a single address
   */
  async scanAddress(address: string): Promise<UTXO[]> {
    const rawUtxos = await fetchAddressUtxos(address);

    let utxos: UTXO[] = rawUtxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      status: {
        confirmed: u.status.confirmed,
        blockHeight: u.status.block_height,
        blockHash: u.status.block_hash,
        blockTime: u.status.block_time,
      },
    }));

    // Filter by minimum value
    utxos = utxos.filter((u) => u.value >= this.minValue);

    // Filter protected UTXOs unless explicitly included
    if (!this.includeProtected) {
      utxos = filterProtectedUtxos(utxos);
    }

    return utxos;
  }

  /**
   * Scan address and enrich UTXOs with signing data
   */
  async scanAddressWithKeys(
    keyData: TaprootKeyData,
    type: "recipient" | "change"
  ): Promise<{ utxos: EnrichedUTXO[]; protectedCount: number }> {
    const rawUtxos = await fetchAddressUtxos(keyData.address);

    const enriched: EnrichedUTXO[] = [];
    let protectedCount = 0;

    for (const u of rawUtxos) {
      // Check minimum value
      if (u.value < this.minValue) continue;

      // Check protected values
      if (!this.includeProtected && isProtectedValue(u.value)) {
        protectedCount++;
        continue;
      }

      enriched.push({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        status: {
          confirmed: u.status.confirmed,
          blockHeight: u.status.block_height,
          blockHash: u.status.block_hash,
          blockTime: u.status.block_time,
        },
        address: keyData.address,
        addressType: type,
        chain: keyData.chain as 0 | 1,
        addressIndex: keyData.index,
        derivationPath: keyData.derivationPath,
        privateKey: keyData.privateKey,
        tweakedPrivateKey: keyData.tweakedPrivateKey,
        internalPubkey: keyData.internalPubkey,
      });
    }

    return { utxos: enriched, protectedCount };
  }

  // ===========================================================================
  // MULTI-ADDRESS SCANNING
  // ===========================================================================

  /**
   * Scan all wallet addresses for UTXOs
   *
   * @param extendedAddresses - Extended addresses from WalletService
   * @param maxAddresses - Maximum addresses to scan (for rate limiting)
   */
  async scanAllAddresses(
    extendedAddresses: ExtendedAddresses,
    maxAddresses: number = 10
  ): Promise<ScanResult> {
    const result: ScanResult = {
      utxos: [],
      totalValue: 0,
      protectedCount: 0,
      scannedAddresses: 0,
      errors: [],
    };

    // Limit addresses to scan (avoid rate limiting)
    const recipientAddresses = extendedAddresses.recipient.slice(
      0,
      maxAddresses
    );
    const changeAddresses = extendedAddresses.change.slice(
      0,
      Math.max(0, maxAddresses - recipientAddresses.length)
    );

    // Scan recipient addresses (chain 0)
    for (const keyData of recipientAddresses) {
      try {
        const { utxos, protectedCount } = await this.scanAddressWithKeys(
          keyData,
          "recipient"
        );
        result.utxos.push(...utxos);
        result.protectedCount += protectedCount;
        result.scannedAddresses++;

        // Rate limiting delay
        await delay(REQUEST_DELAY_MS);
      } catch (error) {
        result.errors.push({
          address: keyData.address,
          type: "recipient",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Scan change addresses (chain 1)
    for (const keyData of changeAddresses) {
      try {
        const { utxos, protectedCount } = await this.scanAddressWithKeys(
          keyData,
          "change"
        );
        result.utxos.push(...utxos);
        result.protectedCount += protectedCount;
        result.scannedAddresses++;

        // Rate limiting delay
        await delay(REQUEST_DELAY_MS);
      } catch (error) {
        result.errors.push({
          address: keyData.address,
          type: "change",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Deduplicate UTXOs by txid:vout
    const seen = new Set<string>();
    result.utxos = result.utxos.filter((utxo) => {
      const key = `${utxo.txid}:${utxo.vout}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Calculate total value
    result.totalValue = result.utxos.reduce((sum, u) => sum + u.value, 0);

    return result;
  }

  // ===========================================================================
  // UTXO SELECTION
  // ===========================================================================

  /**
   * Select optimal UTXOs for a target amount
   *
   * Strategy: Prefer confirmed UTXOs, then sort by value descending
   */
  selectUtxos(
    utxos: EnrichedUTXO[],
    targetAmount: number,
    feeRate: number = 2
  ): UTXOSelection | null {
    // Sort: confirmed first, then by value descending
    const sorted = [...utxos].sort((a, b) => {
      if (a.status.confirmed && !b.status.confirmed) return -1;
      if (!a.status.confirmed && b.status.confirmed) return 1;
      return b.value - a.value;
    });

    const selected: EnrichedUTXO[] = [];
    let total = 0;

    // Taproot fee estimation: ~57.5 vbytes per input, ~43 per output
    const estimateFee = (inputs: number, outputs: number) => {
      const vsize = 10.5 + inputs * 57.5 + outputs * 43;
      return Math.ceil(vsize * feeRate);
    };

    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.value;

      const fee = estimateFee(selected.length, 2); // 2 outputs: recipient + change
      const needed = targetAmount + fee;

      if (total >= needed) {
        return {
          selected,
          total,
          fee,
          change: total - targetAmount - fee,
        };
      }
    }

    // Insufficient funds
    return null;
  }

  /**
   * Get the best single UTXO for a transaction
   * Prefers confirmed, then largest value
   */
  selectBestUtxo(utxos: EnrichedUTXO[]): EnrichedUTXO | null {
    if (utxos.length === 0) return null;

    // Sort: confirmed first, then by value descending
    const sorted = [...utxos].sort((a, b) => {
      if (a.status.confirmed && !b.status.confirmed) return -1;
      if (!a.status.confirmed && b.status.confirmed) return 1;
      return b.value - a.value;
    });

    return sorted[0];
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get total balance from UTXOs
   */
  getTotalBalance(utxos: EnrichedUTXO[]): number {
    return utxos.reduce((sum, u) => sum + u.value, 0);
  }

  /**
   * Format UTXOs for display
   */
  formatForDisplay(utxos: EnrichedUTXO[]): Array<{
    id: string;
    txid: string;
    vout: number;
    value: number;
    formattedValue: string;
    address: string;
    addressType: string;
    confirmed: boolean;
    status: string;
  }> {
    return utxos.map((utxo) => ({
      id: `${utxo.txid}:${utxo.vout}`,
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      formattedValue: `${utxo.value.toLocaleString()} sats`,
      address: utxo.address,
      addressType: utxo.addressType,
      confirmed: utxo.status.confirmed,
      status: utxo.status.confirmed
        ? `Block ${utxo.status.blockHeight}`
        : "Unconfirmed",
    }));
  }

  /**
   * Check if an address has any spendable UTXOs
   */
  async hasSpendableUtxos(address: string): Promise<boolean> {
    const utxos = await this.scanAddress(address);
    return utxos.length > 0;
  }

  /**
   * Get balance for a single address
   */
  async getAddressBalance(address: string): Promise<number> {
    const utxos = await this.scanAddress(address);
    return utxos.reduce((sum, u) => sum + u.value, 0);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const utxoService = new UtxoService();

export default UtxoService;
