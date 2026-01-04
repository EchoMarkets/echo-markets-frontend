// =============================================================================
// MARKET TYPES
// =============================================================================

export interface MarketParams {
  tradingDeadline: number;
  resolutionDeadline: number;
  feeBps: number;
  minBet: number;
}

export type MarketStatus =
  | "Active"
  | "TradingClosed"
  | "Resolved"
  | "Cancelled";

export type Outcome = "Yes" | "No" | "Invalid";

export interface Resolution {
  outcome: Outcome;
  timestamp: number;
  resolverPubkey: string;
}

export interface Market {
  id: string;
  questionHash: string;
  question: string; // Human readable question
  description?: string;
  params: MarketParams;
  status: MarketStatus;
  resolution?: Resolution;
  yesSupply: number;
  noSupply: number;
  maxSupply: number;
  fees: number;
  creator: string;
  createdAt: number;
  // Derived fields
  yesPrice: number; // 0-100 (percentage)
  noPrice: number; // 0-100 (percentage)
  volume: number;
  liquidity: number;
}

export interface MarketPosition {
  marketId: string;
  yesTokens: number;
  noTokens: number;
  avgYesCost: number;
  avgNoCost: number;
}

// =============================================================================
// WALLET TYPES (Updated for Taproot)
// =============================================================================

/**
 * Basic wallet interface (legacy compatibility)
 */
export interface Wallet {
  address: string;
  publicKey: string;
  balance: number; // in sats
  utxos: UTXO[];
}

/**
 * Extended Taproot wallet with all signing data
 */
export interface TaprootWallet extends Wallet {
  // Taproot-specific fields
  internalPubkey: string; // 32-byte x-only pubkey (hex)
  tweakedPrivateKey: string; // Tweaked private key for Schnorr signing (hex)

  // Derivation info
  path: string; // e.g., "m/86'/1'/0'/0/0"
  index: number; // Address index
}

/**
 * Taproot keys for a specific derivation index
 */
export interface TaprootKeys {
  index: number;
  derivationPath: string;
  privateKey: Uint8Array;
  tweakedPrivateKey: Uint8Array;
  internalPubkey: Uint8Array; // 32-byte x-only
  publicKey: Uint8Array; // 33-byte compressed
  address: string;
  script: string; // Output script hex
}

/**
 * Derived wallet from mnemonic
 */
export interface DerivedWallet {
  address: string;
  publicKey: string; // 33-byte compressed pubkey (hex)
  privateKey: string; // 32-byte private key (hex)
  internalPubkey: string; // 32-byte x-only pubkey for Taproot (hex)
  tweakedPrivateKey: string; // Tweaked private key for signing (hex)
  wif: string;
  path: string;
  index: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    blockHeight?: number;
    blockHash?: string;
    blockTime?: number;
  };
}

export interface TokenBalance {
  marketId: string;
  yesTokens: number;
  noTokens: number;
}

// =============================================================================
// TRANSACTION TYPES
// =============================================================================

export type OperationType =
  | "create"
  | "mint"
  | "burn"
  | "trade"
  | "resolve"
  | "redeem"
  | "cancel"
  | "claimFees";

export interface SpellData {
  version: number;
  apps: Record<string, string>;
  publicInputs?: Record<string, unknown>;
  privateInputs?: Record<string, unknown>;
  ins: SpellInput[];
  outs: SpellOutput[];
}

export interface SpellInput {
  utxoId: string;
  charms: Record<string, unknown>;
}

export interface SpellOutput {
  address: string;
  charms: Record<string, unknown>;
}

export interface Transaction {
  txid: string;
  hex: string;
  status: "pending" | "confirmed" | "failed";
  type: OperationType;
  marketId?: string;
  amount?: number;
  timestamp: number;
}

/**
 * Signed transaction pair from prover
 */
export interface SignedTransactions {
  signedCommitTx: string;
  signedSpellTx: string;
  commitTxid: string;
  spellTxid: string;
}

/**
 * Prover API request
 */
export interface ProveRequest {
  spell: SpellData;
  prevTxs: string[];
  fundingUtxo: string; // "txid:vout" format
  fundingUtxoValue: number;
  changeAddress: string;
  feeRate?: number;
  chain?: "bitcoin" | "cardano";
  binaries?: Record<string, string>;
}

/**
 * Prover API response
 */
export interface ProveResponse {
  success: boolean;
  requestId: string;
  transactions: string[];
  commit_tx: string | null;
  spell_tx: string | null;
  needsSignature?: boolean;
  error?: string;
}

/**
 * Cast (prove + broadcast) response
 */
export interface CastResponse extends ProveResponse {
  commitTxid: string | null;
  spellTxid: string | null;
  txid: string | null;
  explorerUrl: string | null;
  broadcast: boolean;
}

// =============================================================================
// UI TYPES
// =============================================================================

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "completed" | "error";
}

export type Theme = "dark" | "light";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
  duration?: number;
}

// =============================================================================
// API TYPES
// =============================================================================

export interface MempoolUTXO {
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

export interface MempoolTx {
  txid: string;
  version: number;
  locktime: number;
  vin: unknown[];
  vout: unknown[];
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

export interface FeeRates {
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
  minimum: number;
}

// =============================================================================
// LEGACY API TYPES (for compatibility)
// =============================================================================

export interface ScrollsSignRequest {
  spell: SpellData;
  unsignedTx: string;
}

export interface ScrollsSignResponse {
  signedTx: string;
  txid: string;
}

export interface ProverRequest {
  spell: SpellData;
  appBin: string;
}

export interface ProverResponse {
  proof: string;
  valid: boolean;
}
