/**
 * WalletService - Wallet management service for Taproot addresses
 *
 * Inspired by CharmsDev/bro WalletGenerator.js and WalletService.js
 * Uses @scure libraries instead of window.* globals
 *
 * Key features:
 * - BIP86 Taproot derivation (m/86'/coinType'/0'/chain/index)
 * - Chain 0 for receiving, Chain 1 for change
 * - Pre-generates multiple addresses for UTXO management
 * - TypeScript with full type safety
 */

import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as btc from "@scure/btc-signer";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils.js";

// =============================================================================
// TYPES
// =============================================================================

export interface TaprootKeyData {
  index: number;
  chain: 0 | 1; // 0 = receive, 1 = change
  address: string; // tb1p... or bc1p...
  derivationPath: string; // e.g., "m/86'/1'/0'/0/0"
  privateKey: string; // 32-byte hex
  tweakedPrivateKey: string; // Tweaked for Schnorr signing
  internalPubkey: string; // 32-byte x-only pubkey hex
  publicKey: string; // 33-byte compressed pubkey hex
  script: string; // Output script hex
  network: "testnet4" | "mainnet";
}

export interface ExtendedAddresses {
  recipient: TaprootKeyData[]; // Chain 0 addresses
  change: TaprootKeyData[]; // Chain 1 addresses
}

export interface WalletData {
  mnemonic: string;
  address: string; // Primary address (recipient[0])
  publicKey: string;
  internalPubkey: string;
  addresses: TaprootKeyData[]; // Legacy: first 3 recipient addresses
  extendedAddresses: ExtendedAddresses;
  isGenerated: boolean;
  isImported: boolean;
  createdAt: string;
}

export interface NetworkConfig {
  network: typeof btc.NETWORK;
  coinType: string;
  isTestnet: boolean;
}

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

const TESTNET4: typeof btc.NETWORK = {
  bech32: "tb",
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const MAINNET: typeof btc.NETWORK = {
  bech32: "bc",
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

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
  return concatBytes(new Uint8Array([0x51, 0x20]), xOnlyPubkey);
}

// =============================================================================
// WALLET SERVICE CLASS
// =============================================================================

export class WalletService {
  private networkConfig: NetworkConfig;

  constructor(isTestnet: boolean = true) {
    this.networkConfig = {
      network: isTestnet ? TESTNET4 : MAINNET,
      coinType: isTestnet ? "1'" : "0'",
      isTestnet,
    };
  }

  // ===========================================================================
  // MNEMONIC MANAGEMENT
  // ===========================================================================

  /**
   * Generate a new 12-word BIP39 mnemonic
   */
  generateMnemonic(): string {
    return bip39.generateMnemonic(wordlist, 128);
  }

  /**
   * Validate a mnemonic phrase
   */
  validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic, wordlist);
  }

  // ===========================================================================
  // KEY GENERATION
  // ===========================================================================

  /**
   * Generate Taproot keys for a specific chain and index
   *
   * @param mnemonic - BIP39 mnemonic
   * @param chain - 0 for receive, 1 for change
   * @param index - Address index
   */
  async generateTaprootKeysForChainAndIndex(
    mnemonic: string,
    chain: 0 | 1,
    index: number
  ): Promise<TaprootKeyData> {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const hdKey = HDKey.fromMasterSeed(seed);

    // BIP86 path: m/86'/coinType'/0'/chain/index
    const derivationPath = `m/86'/${this.networkConfig.coinType}/0'/${chain}/${index}`;
    const child = hdKey.derive(derivationPath);

    if (!child.privateKey || !child.publicKey) {
      throw new Error(`Failed to derive keys for ${derivationPath}`);
    }

    const internalPubkey = toXOnly(child.publicKey);
    const tweakedPrivKey = tweakPrivateKey(child.privateKey, child.publicKey);

    // Create P2TR address
    const p2tr = btc.p2tr(
      internalPubkey,
      undefined,
      this.networkConfig.network
    );
    if (!p2tr.address) throw new Error("Failed to create P2TR address");

    const script = createP2TRScript(internalPubkey);

    return {
      index,
      chain,
      address: p2tr.address,
      derivationPath,
      privateKey: bytesToHex(child.privateKey),
      tweakedPrivateKey: bytesToHex(tweakedPrivKey),
      internalPubkey: bytesToHex(internalPubkey),
      publicKey: bytesToHex(child.publicKey),
      script: bytesToHex(script),
      network: this.networkConfig.isTestnet ? "testnet4" : "mainnet",
    };
  }

  /**
   * Generate keys for receive address (chain 0)
   */
  async generateReceiveAddress(
    mnemonic: string,
    index: number = 0
  ): Promise<TaprootKeyData> {
    return this.generateTaprootKeysForChainAndIndex(mnemonic, 0, index);
  }

  /**
   * Generate keys for change address (chain 1)
   */
  async generateChangeAddress(
    mnemonic: string,
    index: number = 0
  ): Promise<TaprootKeyData> {
    return this.generateTaprootKeysForChainAndIndex(mnemonic, 1, index);
  }

  /**
   * Generate extended addresses (12 receive + 12 change = 24 total)
   * Matches organizers' pattern for UTXO management
   */
  async generateExtendedAddresses(
    mnemonic: string
  ): Promise<ExtendedAddresses> {
    const recipient: TaprootKeyData[] = [];
    const change: TaprootKeyData[] = [];

    // Generate 12 recipient addresses (chain 0)
    for (let i = 0; i < 12; i++) {
      const keyData = await this.generateTaprootKeysForChainAndIndex(
        mnemonic,
        0,
        i
      );
      recipient.push(keyData);
    }

    // Generate 12 change addresses (chain 1)
    for (let i = 0; i < 12; i++) {
      const keyData = await this.generateTaprootKeysForChainAndIndex(
        mnemonic,
        1,
        i
      );
      change.push(keyData);
    }

    return { recipient, change };
  }

  /**
   * Legacy: Generate first N addresses (chain 0 only)
   */
  async generateMultipleAddresses(
    mnemonic: string,
    count: number = 3
  ): Promise<TaprootKeyData[]> {
    const addresses: TaprootKeyData[] = [];
    for (let i = 0; i < count; i++) {
      const keyData = await this.generateReceiveAddress(mnemonic, i);
      addresses.push(keyData);
    }
    return addresses;
  }

  // ===========================================================================
  // WALLET CREATION
  // ===========================================================================

  /**
   * Create a new wallet or import from mnemonic
   *
   * @param mnemonic - Optional mnemonic to import, generates new if not provided
   */
  async createWallet(mnemonic?: string): Promise<WalletData> {
    const finalMnemonic = mnemonic || this.generateMnemonic();

    if (!this.validateMnemonic(finalMnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }

    // Generate legacy addresses (first 3) for compatibility
    const addresses = await this.generateMultipleAddresses(finalMnemonic, 3);

    // Generate extended addresses (24 total) for full UTXO management
    const extendedAddresses = await this.generateExtendedAddresses(
      finalMnemonic
    );

    const primaryAddress = addresses[0];

    return {
      mnemonic: finalMnemonic,
      address: primaryAddress.address,
      publicKey: primaryAddress.publicKey,
      internalPubkey: primaryAddress.internalPubkey,
      addresses,
      extendedAddresses,
      isGenerated: !mnemonic,
      isImported: !!mnemonic,
      createdAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // ADDRESS LOOKUP
  // ===========================================================================

  /**
   * Find key data by address from extended addresses
   */
  findKeyByAddress(
    extendedAddresses: ExtendedAddresses,
    address: string
  ): TaprootKeyData | null {
    // Check recipient addresses
    for (const keyData of extendedAddresses.recipient) {
      if (keyData.address === address) return keyData;
    }

    // Check change addresses
    for (const keyData of extendedAddresses.change) {
      if (keyData.address === address) return keyData;
    }

    return null;
  }

  /**
   * Find key data by output script from extended addresses
   */
  findKeyByScript(
    extendedAddresses: ExtendedAddresses,
    scriptHex: string
  ): TaprootKeyData | null {
    // Check recipient addresses
    for (const keyData of extendedAddresses.recipient) {
      if (keyData.script === scriptHex) return keyData;
    }

    // Check change addresses
    for (const keyData of extendedAddresses.change) {
      if (keyData.script === scriptHex) return keyData;
    }

    return null;
  }

  /**
   * Get all addresses as flat array
   */
  getAllAddresses(extendedAddresses: ExtendedAddresses): string[] {
    return [
      ...extendedAddresses.recipient.map((k) => k.address),
      ...extendedAddresses.change.map((k) => k.address),
    ];
  }

  /**
   * Get next unused change address
   * In a real app, this would track which addresses have been used
   */
  getNextChangeAddress(
    extendedAddresses: ExtendedAddresses,
    usedIndex: number = 0
  ): TaprootKeyData {
    const nextIndex = Math.min(usedIndex, extendedAddresses.change.length - 1);
    return extendedAddresses.change[nextIndex];
  }

  // ===========================================================================
  // DERIVATION PATH HELPERS
  // ===========================================================================

  /**
   * Get base derivation path
   */
  getBasePath(): string {
    return `m/86'/${this.networkConfig.coinType}/0'`;
  }

  /**
   * Get full derivation path for chain and index
   */
  getFullPath(chain: 0 | 1, index: number): string {
    return `${this.getBasePath()}/${chain}/${index}`;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("Clipboard API not available");
  } catch {
    // Fallback: hidden textarea + execCommand
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (!success) throw new Error("execCommand copy failed");
      return true;
    } catch (err) {
      console.error("Copy to clipboard failed:", err);
      return false;
    }
  }
}

/**
 * Mask mnemonic for display (show first and last word)
 */
export function maskMnemonic(mnemonic: string): string {
  const words = mnemonic.split(" ");
  if (words.length <= 2) return mnemonic;

  const masked = words.map((word, i) => {
    if (i === 0 || i === words.length - 1) return word;
    return "••••";
  });

  return masked.join(" ");
}

/**
 * Format address for display (truncate middle)
 */
export function formatAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

// Default to testnet4
export const walletService = new WalletService(true);

// Export for custom network configuration
export default WalletService;
