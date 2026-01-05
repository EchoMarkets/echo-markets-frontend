/**
 * Charms API Client
 *
 * Frontend client for interacting with the Charms v8 Prover API.
 *
 * ProveRequest format from src/spell.rs#L694:
 * ```rust
 * pub struct ProveRequest {
 *     pub spell: Spell,
 *     pub binaries: BTreeMap<B32, Vec<u8>>,
 *     pub prev_txs: Vec<Tx>,
 *     pub funding_utxo: UtxoId,
 *     pub funding_utxo_value: u64,
 *     pub change_address: String,
 *     pub fee_rate: f64,
 *     pub chain: Chain,
 *     pub collateral_utxo: Option<UtxoId>,
 * }
 * ```
 */

import type { SpellData } from "@/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Request to prove a spell via Charms v8 API
 */
export interface ProveRequest {
  spell: SpellData; // Spell object
  prevTxs: string[]; // Previous transaction hexes
  fundingUtxo: string; // "txid:vout" format
  fundingUtxoValue: number; // Value in satoshis
  changeAddress: string; // Bitcoin address for change
  feeRate?: number; // sat/vB (default: 2.0)
  chain?: "bitcoin" | "cardano"; // Network (default: 'bitcoin')
  binaries?: Record<string, string>; // { app_vk: base64_wasm }
}

/**
 * Response from prover
 */
export interface ProveResponse {
  success: boolean;
  requestId: string;
  transactions: string[]; // Array of tx hexes
  commit_tx: string | null; // First transaction
  spell_tx: string | null; // Second transaction (or first if only one)
  error?: string;
  details?: string;
}

/**
 * Request to cast (prove + broadcast)
 */
export interface CastRequest extends ProveRequest {
  broadcast?: boolean; // Default: true
}

/**
 * Response from cast
 */
export interface CastResponse {
  success: boolean;
  requestId: string;
  transactions: string[];
  commit_tx: string | null;
  spell_tx: string | null;
  commitTxid: string | null;
  spellTxid: string | null;
  txid: string | null;
  explorerUrl: string | null;
  broadcast: boolean;
  error?: string;
  details?: string;
}

export interface BroadcastRequest {
  txHex: string;
}

export interface BroadcastResponse {
  success: boolean;
  txid: string;
  explorerUrl: string;
  error?: string;
  details?: string;
}

export interface TxStatusResponse {
  found: boolean;
  txid: string;
  confirmed?: boolean;
  blockHeight?: number;
  blockTime?: number;
  explorerUrl?: string;
}

// =============================================================================
// API CLIENT
// =============================================================================

const API_BASE = "/api/charms";

/**
 * Get configuration from server (like APP_VK)
 */
export async function getConfig(): Promise<{ appVk: string }> {
  const response = await fetch(`${API_BASE}/config`);
  if (!response.ok) {
    throw new Error("Failed to fetch config");
  }
  return response.json();
}

/**
 * Prove a spell (generates ZK proof via Charms v8 API)
 */
export async function proveSpell(
  request: ProveRequest
): Promise<ProveResponse> {
  const response = await fetch(`${API_BASE}/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new CharmsApiError(data.error || "Prove failed", data);
  }

  return data;
}

/**
 * Cast a spell (prove + broadcast)
 * This is the all-in-one operation using Charms v8 Prover API
 */
export async function castSpell(request: CastRequest): Promise<CastResponse> {
  const response = await fetch(`${API_BASE}/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...request,
      broadcast: request.broadcast ?? true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new CharmsApiError(data.error || "Cast failed", data);
  }

  return data;
}

/**
 * Broadcast a signed transaction to testnet4
 */
export async function broadcastTx(
  request: BroadcastRequest
): Promise<BroadcastResponse> {
  const response = await fetch(`${API_BASE}/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new CharmsApiError(data.error || "Broadcast failed", data);
  }

  return data;
}

/**
 * Check transaction status
 */
export async function getTxStatus(txid: string): Promise<TxStatusResponse> {
  const response = await fetch(`${API_BASE}/broadcast?txid=${txid}`);
  return response.json();
}

/**
 * Poll for transaction confirmation
 */
export async function waitForConfirmation(
  txid: string,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onStatus?: (status: TxStatusResponse) => void;
  } = {}
): Promise<TxStatusResponse> {
  const { maxAttempts = 60, intervalMs = 10000, onStatus } = options;

  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTxStatus(txid);

    if (onStatus) {
      onStatus(status);
    }

    if (status.confirmed) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Transaction not confirmed after ${maxAttempts} attempts`);
}

// =============================================================================
// ERROR CLASS
// =============================================================================

export class CharmsApiError extends Error {
  public data: unknown;

  constructor(message: string, data?: unknown) {
    super(message);
    this.name = "CharmsApiError";
    this.data = data;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(txid: string): string {
  return `https://mempool.space/testnet4/tx/${txid}`;
}

/**
 * Get explorer URL for an address
 */
export function getAddressExplorerUrl(address: string): string {
  return `https://mempool.space/testnet4/address/${address}`;
}

/**
 * Load WASM file and convert to base64 (browser)
 */
export async function loadWasmAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      const base64 = btoa(String.fromCharCode(...bytes));
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
