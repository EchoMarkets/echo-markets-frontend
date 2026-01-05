/**
 * Charms & Scrolls API Integration
 *
 * Handles communication with:
 * - Charms Prover Service (proof generation)
 * - Scrolls (transaction signing)
 */

import type {
  SpellData,
  ProverRequest,
  ProverResponse,
  ScrollsSignRequest,
  ScrollsSignResponse,
} from "@/types";
import { sha256 } from "./utils";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert hex string to byte array for standard serde serialization
 * Used for public_inputs (MarketOperation fields without serde_bytes)
 */
function hexToBytes(hex: string): number[] {
  if (!hex || hex.length === 0) return [];
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const paddedHex = cleanHex.length % 2 === 1 ? "0" + cleanHex : cleanHex;
  const bytes: number[] = [];
  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes.push(parseInt(paddedHex.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Convert hex string to base64 for serde_bytes serialization
 * Used for charms output (MarketState fields with serde_bytes)
 */
function hexToBase64(hex: string): string {
  if (!hex || hex.length === 0) return "";
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const paddedHex = cleanHex.length % 2 === 1 ? "0" + cleanHex : cleanHex;
  const bytes = new Uint8Array(paddedHex.length / 2);
  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes[i / 2] = parseInt(paddedHex.slice(i, i + 2), 16);
  }
  return btoa(String.fromCharCode(...bytes));
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROVER_URL =
  process.env.NEXT_PUBLIC_PROVER_URL || "https://prover.charms.dev";
const SCROLLS_URL =
  process.env.NEXT_PUBLIC_SCROLLS_URL || "https://scrolls.charms.dev";
const APP_VK = process.env.NEXT_PUBLIC_APP_VK || "";

// =============================================================================
// SPELL BUILDER
// =============================================================================

export class SpellBuilder {
  private marketId: string;
  private appVk: string;

  constructor(marketId: string, appVk: string = APP_VK) {
    this.marketId = marketId;
    this.appVk = appVk;

    // Warn if appVk is empty - this will cause validation errors
    if (!this.appVk || this.appVk.trim().length === 0) {
      console.warn(
        "SpellBuilder: appVk is empty. This may cause prover validation errors. " +
          "Set NEXT_PUBLIC_APP_VK environment variable or pass appVk to constructor."
      );
    }
  }

  /**
   * Get YES token ID for this market
   */
  get yesTokenId(): string {
    // In real implementation, this would be SHA256(marketId + "YES")
    return `${this.marketId}YES`.slice(0, 64);
  }

  /**
   * Get NO token ID for this market
   */
  get noTokenId(): string {
    return `${this.marketId}NO`.slice(0, 64);
  }

  /**
   * Build Create Market spell
   */
  buildCreateSpell(params: {
    fundingUtxo: string;
    questionHash: string;
    tradingDeadline: number;
    resolutionDeadline: number;
    feeBps: number;
    minBet: number;
    maxSupply: number;
    creatorPubkey: string;
    outputAddress: string;
  }): SpellData {
    return {
      version: 8,
      apps: {
        $00: `n/${this.marketId}/${this.appVk}`,
      },
      privateInputs: {
        $00: params.fundingUtxo,
      },
      publicInputs: {
        $00: {
          Create: {
            question_hash: params.questionHash, // Plain hex string like "f61856..."
            params: {
              trading_deadline: params.tradingDeadline,
              resolution_deadline: params.resolutionDeadline,
              fee_bps: params.feeBps,
              min_bet: params.minBet,
            },
          },
        },
      },
      ins: [
        {
          utxoId: params.fundingUtxo,
          charms: {},
        },
      ],
      outs: [
        {
          address: params.outputAddress,
          charms: {
            $00: {
              market_id: hexToBase64(this.marketId),
              question_hash: hexToBase64(params.questionHash),
              params: {
                trading_deadline: params.tradingDeadline,
                resolution_deadline: params.resolutionDeadline,
                fee_bps: params.feeBps,
                min_bet: params.minBet,
              },
              status: "Active",
              resolution: null,
              yes_supply: 0,
              no_supply: 0,
              max_supply: params.maxSupply,
              fees: 0,
              creator: hexToBase64(params.creatorPubkey),
            },
          },
        },
      ],
    };
  }

  /**
   * Build Mint Shares spell
   */
  buildMintSpell(params: {
    marketUtxoId: string;
    userBtcUtxo: string;
    currentState: {
      questionHash: string;
      tradingDeadline: number;
      resolutionDeadline: number;
      feeBps: number;
      minBet: number;
      maxSupply: number;
      oldYesSupply: number;
      oldNoSupply: number;
      oldFees: number;
      creatorPubkey: string;
    };
    mintAmount: number;
    currentTimestamp: number;
    marketAddress: string;
    userAddress: string;
  }): SpellData {
    const { currentState, mintAmount } = params;
    const fee = Math.floor((mintAmount * currentState.feeBps) / 10000);
    const shares = mintAmount - fee;

    return {
      version: 8,
      apps: {
        $00: `n/${this.marketId}/${this.appVk}`,
        $01: `t/${this.yesTokenId}/${this.appVk}`,
        $02: `t/${this.noTokenId}/${this.appVk}`,
      },
      publicInputs: {
        $00: {
          Mint: {
            collateral_amount: mintAmount,
            current_timestamp: params.currentTimestamp,
          },
        },
      },
      ins: [
        {
          utxoId: params.marketUtxoId,
          charms: {
            $00: {
              market_id: hexToBase64(this.marketId),
              question_hash: hexToBase64(currentState.questionHash),
              params: {
                trading_deadline: currentState.tradingDeadline,
                resolution_deadline: currentState.resolutionDeadline,
                fee_bps: currentState.feeBps,
                min_bet: currentState.minBet,
              },
              status: "Active",
              resolution: null,
              yes_supply: currentState.oldYesSupply,
              no_supply: currentState.oldNoSupply,
              max_supply: currentState.maxSupply,
              fees: currentState.oldFees,
              creator: hexToBase64(currentState.creatorPubkey),
            },
          },
        },
        {
          utxoId: params.userBtcUtxo,
          charms: {},
        },
      ],
      outs: [
        {
          address: params.marketAddress,
          charms: {
            $00: {
              market_id: hexToBase64(this.marketId),
              question_hash: hexToBase64(currentState.questionHash),
              params: {
                trading_deadline: currentState.tradingDeadline,
                resolution_deadline: currentState.resolutionDeadline,
                fee_bps: currentState.feeBps,
                min_bet: currentState.minBet,
              },
              status: "Active",
              resolution: null,
              yes_supply: currentState.oldYesSupply + shares,
              no_supply: currentState.oldNoSupply + shares,
              max_supply: currentState.maxSupply,
              fees: currentState.oldFees + fee,
              creator: hexToBase64(currentState.creatorPubkey),
            },
          },
        },
        {
          address: params.userAddress,
          charms: {
            $01: shares,
          },
        },
        {
          address: params.userAddress,
          charms: {
            $02: shares,
          },
        },
      ],
    };
  }

  /**
   * Build Trade spell (P2P swap)
   */
  buildTradeSpell(params: {
    userTokenUtxo: string;
    userSellAmount: number;
    userSellOutcome: "Yes" | "No";
    counterpartyTokenUtxo: string;
    counterpartyAmount: number;
    counterpartyOutcome: "Yes" | "No";
    userAddress: string;
    counterpartyAddress: string;
  }): SpellData {
    // Generate token IDs from market ID
    const yesTokenId = sha256(`${this.marketId}YES`).slice(0, 32);
    const noTokenId = sha256(`${this.marketId}NO`).slice(0, 32);

    const userTokenId =
      params.userSellOutcome === "Yes" ? yesTokenId : noTokenId;
    const counterpartyTokenId =
      params.counterpartyOutcome === "Yes" ? yesTokenId : noTokenId;

    return {
      version: 8,
      apps: {
        $01: `t/${userTokenId}/${this.appVk}`,
        $02: `t/${counterpartyTokenId}/${this.appVk}`,
      },
      ins: [
        {
          utxoId: params.userTokenUtxo,
          charms: { $01: params.userSellAmount },
        },
        {
          utxoId: params.counterpartyTokenUtxo,
          charms: { $02: params.counterpartyAmount },
        },
      ],
      outs: [
        {
          address: params.userAddress,
          charms: { $02: params.counterpartyAmount }, // User receives counterparty's tokens
        },
        {
          address: params.counterpartyAddress,
          charms: { $01: params.userSellAmount }, // Counterparty receives user's tokens
        },
      ],
    };
  }

  /**
   * Build Resolve spell
   */
  buildResolveSpell(params: {
    marketUtxoId: string;
    currentState: {
      questionHash: string;
      tradingDeadline: number;
      resolutionDeadline: number;
      feeBps: number;
      minBet: number;
      maxSupply: number;
      yesSupply: number;
      noSupply: number;
      fees: number;
      creatorPubkey: string;
      currentStatus: string;
    };
    outcome: "Yes" | "No" | "Invalid";
    resolverPubkey: string;
    signature: string;
    currentTimestamp: number;
    marketAddress: string;
  }): SpellData {
    return {
      version: 8,
      apps: {
        $00: `n/${this.marketId}/${this.appVk}`,
      },
      publicInputs: {
        $00: {
          Resolve: {
            outcome: params.outcome,
            proof: {
              SignedAttestation: {
                resolver_pubkey: hexToBytes(params.resolverPubkey),
                signature: hexToBytes(params.signature),
              },
            },
            current_timestamp: params.currentTimestamp,
          },
        },
      },
      ins: [
        {
          utxoId: params.marketUtxoId,
          charms: {
            $00: {
              market_id: hexToBase64(this.marketId),
              question_hash: hexToBase64(params.currentState.questionHash),
              params: {
                trading_deadline: params.currentState.tradingDeadline,
                resolution_deadline: params.currentState.resolutionDeadline,
                fee_bps: params.currentState.feeBps,
                min_bet: params.currentState.minBet,
              },
              status: params.currentState.currentStatus,
              resolution: null,
              yes_supply: params.currentState.yesSupply,
              no_supply: params.currentState.noSupply,
              max_supply: params.currentState.maxSupply,
              fees: params.currentState.fees,
              creator: hexToBase64(params.currentState.creatorPubkey),
            },
          },
        },
      ],
      outs: [
        {
          address: params.marketAddress,
          charms: {
            $00: {
              market_id: hexToBase64(this.marketId),
              question_hash: hexToBase64(params.currentState.questionHash),
              params: {
                trading_deadline: params.currentState.tradingDeadline,
                resolution_deadline: params.currentState.resolutionDeadline,
                fee_bps: params.currentState.feeBps,
                min_bet: params.currentState.minBet,
              },
              status: "Resolved",
              resolution: {
                outcome: params.outcome,
                proof: {
                  SignedAttestation: {
                    resolver_pubkey: hexToBase64(params.resolverPubkey),
                    signature: hexToBase64(params.signature),
                  },
                },
                timestamp: params.currentTimestamp,
              },
              yes_supply: params.currentState.yesSupply,
              no_supply: params.currentState.noSupply,
              max_supply: params.currentState.maxSupply,
              fees: params.currentState.fees,
              creator: hexToBase64(params.currentState.creatorPubkey),
            },
          },
        },
      ],
    };
  }

  /**
   * Build Redeem spell
   */
  buildRedeemSpell(params: {
    marketUtxoId: string;
    userTokensUtxo: string;
    marketState: Record<string, unknown>;
    yesTokensBurned: number;
    noTokensBurned: number;
    marketAddress: string;
    userAddress: string;
  }): SpellData {
    return {
      version: 8,
      apps: {
        $00: `n/${this.marketId}/${this.appVk}`,
        $01: `t/${this.yesTokenId}/${this.appVk}`,
        $02: `t/${this.noTokenId}/${this.appVk}`,
      },
      publicInputs: {
        $00: {
          Redeem: {
            yes_amount: params.yesTokensBurned,
            no_amount: params.noTokensBurned,
          },
        },
      },
      ins: [
        {
          utxoId: params.marketUtxoId,
          charms: {
            $00: params.marketState,
          },
        },
        {
          utxoId: params.userTokensUtxo,
          charms: {
            $01: params.yesTokensBurned,
            $02: params.noTokensBurned,
          },
        },
      ],
      outs: [
        {
          address: params.marketAddress,
          charms: {
            $00: params.marketState, // Pass through unchanged
          },
        },
        {
          address: params.userAddress,
          charms: {}, // Receives BTC, tokens burned
        },
      ],
    };
  }
}

// =============================================================================
// PROVER CLIENT
// =============================================================================

export class CharmsProver {
  private baseUrl: string;

  constructor(baseUrl: string = PROVER_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get prover status
   */
  async getStatus(): Promise<{ ready: boolean; version: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) throw new Error("Prover unavailable");
      return response.json();
    } catch {
      return { ready: false, version: "unknown" };
    }
  }

  /**
   * Generate proof for a spell
   */
  async prove(request: ProverRequest): Promise<ProverResponse> {
    const response = await fetch(`${this.baseUrl}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Proof generation failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Verify a proof
   */
  async verify(spell: SpellData, proof: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spell, proof }),
    });

    if (!response.ok) return false;

    const result = await response.json();
    return result.valid;
  }
}

// =============================================================================
// SCROLLS CLIENT
// =============================================================================

export class ScrollsClient {
  private baseUrl: string;

  constructor(baseUrl: string = SCROLLS_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Request Scrolls to sign a transaction
   * Scrolls validates the spell before signing
   */
  async signTransaction(
    request: ScrollsSignRequest
  ): Promise<ScrollsSignResponse> {
    const response = await fetch(`${this.baseUrl}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Scrolls signing failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Check if Scrolls is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const prover = new CharmsProver();
export const scrolls = new ScrollsClient();

// Helper to create market ID from UTXO
export async function createMarketId(utxoId: string): Promise<string> {
  return sha256(utxoId);
}

// Helper to create question hash
export async function createQuestionHash(question: string): Promise<string> {
  return sha256(question);
}
