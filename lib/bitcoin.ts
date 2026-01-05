/**
 * Bitcoin Testnet4 Integration with Taproot (P2TR) Support
 *
 * Uses @scure/btc-signer for transaction building and signing.
 * Implements BIP86 Taproot derivation matching CharmsDev/bro approach.
 *
 * Key differences from SegWit (P2WPKH):
 * - BIP86 path: m/86'/1'/0'/0/{index} (vs BIP84 m/84'/1'/0'/0/0)
 * - P2TR addresses: tb1p... (vs tb1q...)
 * - Schnorr signatures (vs ECDSA)
 * - Key tweaking required for spending
 */

import * as btc from "@scure/btc-signer";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils.js";

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

/**
 * Bitcoin Testnet4 network parameters
 */
export const TESTNET4: typeof btc.NETWORK = {
  bech32: "tb",
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

export const MAINNET: typeof btc.NETWORK = {
  bech32: "bc",
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

// Default to testnet4
const DEFAULT_NETWORK = TESTNET4;
const MEMPOOL_API = "https://mempool.space/testnet4/api";

// =============================================================================
// TYPES
// =============================================================================

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

// =============================================================================
// TAPROOT KEY UTILITIES
// =============================================================================

/**
 * Convert 33-byte compressed pubkey to 32-byte x-only format
 */
function toXOnly(pubkey: Uint8Array): Uint8Array {
  if (pubkey.length === 32) return pubkey;
  if (pubkey.length === 33) return pubkey.slice(1, 33);
  throw new Error(`Invalid pubkey length: ${pubkey.length}`);
}

/**
 * Tagged hash for Taproot (BIP340)
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  return sha256(concatBytes(tagHash, tagHash, data));
}

/**
 * Apply Taproot tweak to private key
 */
function tweakPrivateKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  const xOnlyPubkey = toXOnly(publicKey);
  const tweak = taggedHash("TapTweak", xOnlyPubkey);

  // Check if Y coordinate is odd (prefix 0x03)
  const isOddY = publicKey[0] === 0x03;

  // Negate private key if Y is odd
  let privKey = privateKey;
  if (isOddY) {
    const n = secp256k1.Point.CURVE().n;
    const privBigInt = BigInt("0x" + bytesToHex(privateKey));
    const negated = n - privBigInt;
    privKey = hexToBytes(negated.toString(16).padStart(64, "0"));
  }

  // Add tweak to private key (mod n)
  const n = secp256k1.Point.CURVE().n;
  const privBigInt = BigInt("0x" + bytesToHex(privKey));
  const tweakBigInt = BigInt("0x" + bytesToHex(tweak));
  const tweaked = (privBigInt + tweakBigInt) % n;

  return hexToBytes(tweaked.toString(16).padStart(64, "0"));
}

/**
 * Create P2TR output script from x-only pubkey
 */
function createP2TRScript(xOnlyPubkey: Uint8Array): Uint8Array {
  // OP_1 (0x51) + PUSH32 (0x20) + 32-byte pubkey
  return concatBytes(new Uint8Array([0x51, 0x20]), xOnlyPubkey);
}

/**
 * Create P2TR address from x-only pubkey
 */
function createP2TRAddress(
  xOnlyPubkey: Uint8Array,
  network: typeof btc.NETWORK = DEFAULT_NETWORK
): string {
  const p2tr = btc.p2tr(xOnlyPubkey, undefined, network);
  if (!p2tr.address) throw new Error("Failed to create P2TR address");
  return p2tr.address;
}

// =============================================================================
// WALLET DERIVATION (BIP86 - Taproot)
// =============================================================================

/**
 * Generate a new 12-word mnemonic
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(wordlist, 128);
}

/**
 * Validate a mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic, wordlist);
}

/**
 * Generate Taproot keys for a specific derivation index
 * Path: m/86'/1'/0'/0/{index} for testnet, m/86'/0'/0'/0/{index} for mainnet
 */
export async function generateTaprootKeysForIndex(
  seedPhrase: string,
  index: number,
  isTestnet: boolean = true
): Promise<TaprootKeys> {
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const hdKey = HDKey.fromMasterSeed(seed);

  const coinType = isTestnet ? "1'" : "0'";
  const derivationPath = `m/86'/${coinType}/0'/0/${index}`;
  const child = hdKey.derive(derivationPath);

  if (!child.privateKey || !child.publicKey) {
    throw new Error(`Failed to derive keys for index ${index}`);
  }

  const network = isTestnet ? TESTNET4 : MAINNET;
  const internalPubkey = toXOnly(child.publicKey);
  const tweakedPrivateKey = tweakPrivateKey(child.privateKey, child.publicKey);

  // Create P2TR address
  const address = createP2TRAddress(internalPubkey, network);
  const script = bytesToHex(createP2TRScript(internalPubkey));

  return {
    index,
    derivationPath,
    privateKey: child.privateKey,
    tweakedPrivateKey,
    internalPubkey,
    publicKey: child.publicKey,
    address,
    script,
  };
}

/**
 * Derive wallet from mnemonic using BIP86 (Taproot)
 * Default to index 0
 */
export async function deriveWalletFromMnemonic(
  mnemonic: string,
  index: number = 0,
  isTestnet: boolean = true
): Promise<DerivedWallet> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic");
  }

  const keys = await generateTaprootKeysForIndex(mnemonic, index, isTestnet);
  const wif = encodeWIF(keys.privateKey, isTestnet);

  return {
    address: keys.address,
    publicKey: bytesToHex(keys.publicKey),
    privateKey: bytesToHex(keys.privateKey),
    internalPubkey: bytesToHex(keys.internalPubkey),
    tweakedPrivateKey: bytesToHex(keys.tweakedPrivateKey),
    wif,
    path: keys.derivationPath,
    index,
  };
}

/**
 * Generate new wallet with random mnemonic
 */
export async function generateNewWallet(): Promise<{
  mnemonic: string;
  wallet: DerivedWallet;
}> {
  const mnemonic = generateMnemonic();
  const wallet = await deriveWalletFromMnemonic(mnemonic);
  return { mnemonic, wallet };
}

/**
 * Derive multiple addresses from mnemonic (for UTXO lookup)
 */
export async function deriveMultipleAddresses(
  mnemonic: string,
  count: number = 10,
  isTestnet: boolean = true
): Promise<TaprootKeys[]> {
  const addresses: TaprootKeys[] = [];
  for (let i = 0; i < count; i++) {
    const keys = await generateTaprootKeysForIndex(mnemonic, i, isTestnet);
    addresses.push(keys);
  }
  return addresses;
}

/**
 * Find address index by matching output script
 */
export async function findAddressIndexByScript(
  seedPhrase: string,
  targetScriptHex: string,
  maxIndex: number = 100,
  isTestnet: boolean = true
): Promise<number> {
  for (let i = 0; i < maxIndex; i++) {
    const keys = await generateTaprootKeysForIndex(seedPhrase, i, isTestnet);
    if (keys.script === targetScriptHex) {
      return i;
    }
  }
  return -1;
}

/**
 * Encode private key to WIF format
 */
function encodeWIF(privateKey: Uint8Array, isTestnet: boolean = true): string {
  const prefix = new Uint8Array([isTestnet ? 0xef : 0x80]);
  const suffix = new Uint8Array([0x01]); // compressed flag
  const data = concatBytes(prefix, privateKey, suffix);

  const hash1 = sha256(data);
  const hash2 = sha256(hash1);
  const checksum = hash2.slice(0, 4);

  return base58Encode(concatBytes(data, checksum));
}

function base58Encode(data: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  let num = BigInt("0x" + bytesToHex(data));
  let result = "";

  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(58));
    num = num / BigInt(58);
    result = ALPHABET[remainder] + result;
  }

  for (const byte of data) {
    if (byte === 0) result = "1" + result;
    else break;
  }

  return result;
}

// =============================================================================
// UTXO MANAGEMENT
// =============================================================================

/**
 * Fetch UTXOs from mempool.space
 */
export async function fetchUTXOs(address: string): Promise<MempoolUTXO[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch UTXOs for multiple addresses
 */
export async function fetchUTXOsMultiple(
  addresses: string[]
): Promise<Map<string, MempoolUTXO[]>> {
  const results = new Map<string, MempoolUTXO[]>();

  await Promise.all(
    addresses.map(async (address) => {
      try {
        const utxos = await fetchUTXOs(address);
        results.set(address, utxos);
      } catch {
        results.set(address, []);
      }
    })
  );

  return results;
}

/**
 * Calculate total balance from UTXOs
 */
export function calculateBalance(utxos: MempoolUTXO[]): number {
  return utxos.reduce((sum, utxo) => sum + utxo.value, 0);
}

/**
 * Get transaction hex
 */
export async function fetchTxHex(txid: string): Promise<string> {
  const response = await fetch(`${MEMPOOL_API}/tx/${txid}/hex`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tx: ${response.statusText}`);
  }
  return response.text();
}

/**
 * Get UTXO value from transaction hex
 */
export function getUtxoValueFromTxHex(txHex: string, vout: number): number {
  const tx = btc.Transaction.fromRaw(hexToBytes(txHex));
  const output = tx.getOutput(vout);
  if (!output || output.amount === undefined) {
    throw new Error(`Output ${vout} not found in transaction`);
  }
  return Number(output.amount);
}

/**
 * Get output script from transaction hex
 */
export function getOutputScriptFromTxHex(txHex: string, vout: number): string {
  const tx = btc.Transaction.fromRaw(hexToBytes(txHex));
  const output = tx.getOutput(vout);
  if (!output || !output.script) {
    throw new Error(`Output ${vout} not found in transaction`);
  }
  return bytesToHex(output.script);
}

/**
 * Select UTXOs for a given amount
 */
export function selectUTXOs(
  utxos: MempoolUTXO[],
  targetAmount: number,
  feeRate: number = 2
): { selected: MempoolUTXO[]; fee: number; change: number } | null {
  const sorted = [...utxos].sort((a, b) => {
    if (a.status.confirmed && !b.status.confirmed) return -1;
    if (!a.status.confirmed && b.status.confirmed) return 1;
    return b.value - a.value;
  });

  const selected: MempoolUTXO[] = [];
  let total = 0;

  // Taproot size estimation: ~57.5 vbytes per input, ~43 per output
  const estimateFee = (inputs: number, outputs: number) => {
    const vsize = 10.5 + inputs * 57.5 + outputs * 43;
    return Math.ceil(vsize * feeRate);
  };

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;

    const fee = estimateFee(selected.length, 2);
    const needed = targetAmount + fee;

    if (total >= needed) {
      return {
        selected,
        fee,
        change: total - targetAmount - fee,
      };
    }
  }

  return null;
}

// =============================================================================
// TAPROOT TRANSACTION SIGNING
// =============================================================================

/**
 * Sign commit_tx from prover using Taproot/Schnorr
 *
 * commit_tx structure:
 * - 1 input: funding UTXO (needs user signature)
 * - 1 output: to be spent by spell_tx
 */
export async function signCommitTx(
  unsignedTxHex: string,
  miningTxHex: string,
  seedPhrase: string,
  isTestnet: boolean = true
): Promise<{ signedHex: string; txid: string }> {
  // Parse unsigned transaction
  const tx = btc.Transaction.fromRaw(hexToBytes(unsignedTxHex), {
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
  });

  // Get input details
  const input = tx.getInput(0);
  if (!input || !input.txid) {
    throw new Error("No input found in commit transaction");
  }

  const inputVout = input.index!;

  // Get UTXO value and script from mining tx
  const utxoValue = getUtxoValueFromTxHex(miningTxHex, inputVout);
  const outputScript = getOutputScriptFromTxHex(miningTxHex, inputVout);

  // Funding UTXO is always from main wallet address (index 0)
  // The commit_tx input is always from the user's funding UTXO (main wallet address at index 0)
  // The output goes to a prover-controlled address we don't need to sign
  const addressIndex = 0;
  const keys = await generateTaprootKeysForIndex(
    seedPhrase,
    addressIndex,
    isTestnet
  );

  // Build new transaction for signing
  const signedTx = new btc.Transaction({ allowUnknownOutputs: true });

  // Add input with Taproot data
  signedTx.addInput({
    txid: input.txid,
    index: inputVout,
    witnessUtxo: {
      script: hexToBytes(outputScript),
      amount: BigInt(utxoValue),
    },
    tapInternalKey: keys.internalPubkey,
    sequence: input.sequence,
  });

  // Copy outputs
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    signedTx.addOutput({
      script: output.script!,
      amount: output.amount!,
    });
  }

  // Sign with Schnorr
  signedTx.signIdx(keys.tweakedPrivateKey, 0);
  signedTx.finalizeIdx(0);

  const signedHex = bytesToHex(signedTx.extract());
  const txid = signedTx.id;

  return { signedHex, txid };
}

/**
 * Sign spell_tx from prover using Taproot/Schnorr
 *
 * spell_tx structure:
 * - Multiple inputs: mining UTXOs (need signature) + commit output (already signed by prover)
 * - Last input is pre-signed by prover - preserve its witness
 */
export async function signSpellTx(
  unsignedTxHex: string,
  signedCommitTxHex: string,
  mnemonic: string,
  isTestnet: boolean = true
): Promise<{ signedHex: string; txid: string }> {
  // Parse commit tx to get output info
  const commitTx = btc.Transaction.fromRaw(hexToBytes(signedCommitTxHex), {
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
  });
  const commitTxid = commitTx.id;
  const commitOutput = commitTx.getOutput(0);

  if (
    !commitOutput ||
    !commitOutput.script ||
    commitOutput.amount === undefined
  ) {
    throw new Error("Invalid commit tx output");
  }

  // Parse the unsigned spell tx just to read its structure
  const unsignedTx = btc.Transaction.fromRaw(hexToBytes(unsignedTxHex), {
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
  });

  // Derive signing key
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const path = isTestnet ? "m/86'/1'/0'/0/0" : "m/86'/0'/0'/0/0";
  const child = hdKey.derive(path);
  const privateKey = child.privateKey;

  if (!privateKey) {
    throw new Error("Failed to derive private key");
  }

  const pubkey = secp256k1.getPublicKey(privateKey, true);
  const schnorrPubkey = pubkey.slice(1);

  // Build fresh transaction
  const tx = new btc.Transaction({
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
  });

  // Add input that spends commit_tx output (our input to sign)
  tx.addInput({
    txid: commitTxid,
    index: 0,
    witnessUtxo: {
      script: commitOutput.script,
      amount: commitOutput.amount,
    },
    tapInternalKey: schnorrPubkey,
  });

  // Copy ALL outputs from unsigned tx using raw scripts
  for (let i = 0; i < unsignedTx.outputsLength; i++) {
    const output = unsignedTx.getOutput(i);
    if (output.script && output.amount !== undefined) {
      tx.addOutput({
        script: output.script,
        amount: output.amount,
      });
    }
  }

  // Debug: log amounts
  console.log("Commit output amount:", commitOutput.amount);
  let totalOut = BigInt(0);
  for (let i = 0; i < tx.outputsLength; i++) {
    const out = tx.getOutput(i);
    console.log(`Output ${i}: ${out.amount}`);
    totalOut += out.amount || BigInt(0);
  }
  console.log("Total outputs:", totalOut);

  // Sign and finalize
  tx.signIdx(privateKey, 0);
  tx.finalize();

  return {
    signedHex: bytesToHex(tx.toBytes()),
    txid: tx.id,
  };
}

/**
 * Sign both commit and spell transactions
 */
export async function signProverTransactions(
  commitTxHex: string,
  spellTxHex: string,
  miningTxHex: string,
  seedPhrase: string,
  isTestnet: boolean = true
): Promise<{
  signedCommitTx: string;
  signedSpellTx: string;
  commitTxid: string;
  spellTxid: string;
}> {
  // Sign commit transaction
  const commit = await signCommitTx(
    commitTxHex,
    miningTxHex,
    seedPhrase,
    isTestnet
  );

  // Sign spell transaction
  const spell = await signSpellTx(
    spellTxHex,
    commit.signedHex,
    seedPhrase,
    isTestnet
  );

  return {
    signedCommitTx: commit.signedHex,
    signedSpellTx: spell.signedHex,
    commitTxid: commit.txid,
    spellTxid: spell.txid,
  };
}

// =============================================================================
// BROADCAST
// =============================================================================

/**
 * Broadcast a single transaction
 */
export async function broadcastTransaction(txHex: string): Promise<string> {
  const response = await fetch(`${MEMPOOL_API}/tx`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: txHex,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Broadcast failed: ${error}`);
  }

  return response.text();
}

/**
 * Broadcast transaction package (commit + spell atomically)
 * Note: mempool.space doesn't support package relay, so we broadcast sequentially
 * For true package relay, use a Bitcoin Core node with RPC
 */
export async function broadcastTxPackage(
  signedCommitTxHex: string,
  signedSpellTxHex: string
): Promise<{ commitTxid: string; spellTxid: string }> {
  // Broadcast commit first
  const commitTxid = await broadcastTransaction(signedCommitTxHex);
  console.log("Commit tx broadcast:", commitTxid);

  // Small delay to let commit propagate
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Broadcast spell
  const spellTxid = await broadcastTransaction(signedSpellTxHex);
  console.log("Spell tx broadcast:", spellTxid);

  return { commitTxid, spellTxid };
}

// =============================================================================
// TRANSACTION STATUS
// =============================================================================

export interface TransactionStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

export interface TransactionInfo {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  weight: number;
  fee: number;
  status: TransactionStatus;
}

/**
 * Get transaction status (confirmed/unconfirmed)
 */
export async function getTransactionStatus(
  txid: string
): Promise<TransactionStatus> {
  const response = await fetch(`${MEMPOOL_API}/tx/${txid}/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tx status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get full transaction info
 */
export async function getTransaction(txid: string): Promise<TransactionInfo> {
  const response = await fetch(`${MEMPOOL_API}/tx/${txid}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch transaction: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get current block height (tip)
 */
export async function getBlockHeight(): Promise<number> {
  const response = await fetch(`${MEMPOOL_API}/blocks/tip/height`);
  if (!response.ok) {
    throw new Error(`Failed to fetch block height: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get number of confirmations for a transaction
 */
export async function getConfirmations(txid: string): Promise<number> {
  const [status, tipHeight] = await Promise.all([
    getTransactionStatus(txid),
    getBlockHeight(),
  ]);

  if (!status.confirmed || !status.block_height) {
    return 0;
  }

  return tipHeight - status.block_height + 1;
}

/**
 * Wait for transaction confirmation with polling
 */
export async function waitForConfirmation(
  txid: string,
  requiredConfirmations: number = 1,
  timeoutMs: number = 600000, // 10 minutes default
  pollIntervalMs: number = 10000 // 10 seconds
): Promise<{
  confirmed: boolean;
  confirmations: number;
  blockHeight?: number;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const confirmations = await getConfirmations(txid);

      if (confirmations >= requiredConfirmations) {
        const status = await getTransactionStatus(txid);
        return {
          confirmed: true,
          confirmations,
          blockHeight: status.block_height,
        };
      }
    } catch {
      // Ignore errors, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return { confirmed: false, confirmations: 0 };
}

// =============================================================================
// FEE ESTIMATION
// =============================================================================

export interface FeeRates {
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
  minimum: number;
}

let cachedFeeRates: FeeRates | null = null;
let feeRatesCacheTime: number = 0;
const FEE_CACHE_TTL = 60000; // 1 minute

/**
 * Get current fee rates from mempool.space
 */
export async function getFeeRates(): Promise<FeeRates> {
  // Return cached if valid
  if (cachedFeeRates && Date.now() - feeRatesCacheTime < FEE_CACHE_TTL) {
    return cachedFeeRates;
  }

  try {
    const response = await fetch(`${MEMPOOL_API}/v1/fees/recommended`);
    if (!response.ok) throw new Error("Failed to fetch fees");

    const data = await response.json();
    cachedFeeRates = {
      fastest: data.fastestFee,
      halfHour: data.halfHourFee,
      hour: data.hourFee,
      economy: data.economyFee,
      minimum: data.minimumFee,
    };
    feeRatesCacheTime = Date.now();

    return cachedFeeRates;
  } catch {
    return {
      fastest: 2,
      halfHour: 2,
      hour: 1,
      economy: 1,
      minimum: 1,
    };
  }
}

/**
 * Estimate Taproot transaction size in vbytes
 */
export function estimateTaprootTxSize(
  numInputs: number,
  numOutputs: number
): number {
  // Base: ~10.5 vbytes (version, locktime, counts, marker/flag)
  // Taproot input: ~57.5 vbytes each
  // Taproot output: ~43 vbytes each
  return Math.ceil(10.5 + numInputs * 57.5 + numOutputs * 43);
}

/**
 * Calculate fee for a Taproot transaction
 */
export async function calculateTaprootFee(
  numInputs: number,
  numOutputs: number,
  feeRate?: number
): Promise<number> {
  if (!feeRate) {
    const rates = await getFeeRates();
    feeRate = rates.hour;
  }

  const size = estimateTaprootTxSize(numInputs, numOutputs);
  return Math.ceil(size * feeRate);
}

// =============================================================================
// EXPLORER & UTILITIES
// =============================================================================

export function getExplorerUrl(type: "tx" | "address", value: string): string {
  return `https://mempool.space/testnet4/${type}/${value}`;
}

export const TESTNET4_FAUCETS = [
  {
    name: "Mempool.space",
    url: "https://mempool.space/testnet4/faucet",
    description: "Official mempool.space testnet4 faucet",
  },
];

/**
 * Parse transaction to extract input/output details
 */
export function parseTransaction(txHex: string): {
  version: number;
  inputs: Array<{ txid: string; vout: number; sequence: number }>;
  outputs: Array<{ value: number; script: string }>;
} {
  const tx = btc.Transaction.fromRaw(hexToBytes(txHex));

  const inputs = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    inputs.push({
      txid: input.txid ? bytesToHex(input.txid) : "",
      vout: input.index || 0,
      sequence: input.sequence || 0xffffffff,
    });
  }

  const outputs = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    outputs.push({
      value: Number(output.amount || 0),
      script: output.script ? bytesToHex(output.script) : "",
    });
  }

  return {
    version: tx.version,
    inputs,
    outputs,
  };
}

// =============================================================================
// RE-EXPORTS FOR COMPATIBILITY
// =============================================================================

export { hexToBytes, bytesToHex };
export { sha256 } from "@noble/hashes/sha2.js";
