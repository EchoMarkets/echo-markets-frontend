/**
 * useCharms Hook
 *
 * React hook for executing Charms spells via the v8 Prover API.
 *
 * Transaction Signing Flow (Taproot/Schnorr):
 *
 * 1. commit_tx:
 *    - Spends 1 input (funding UTXO from mining tx)
 *    - Creates 1 output (for spell_tx to spend)
 *    - Must be FULLY SIGNED by user with Schnorr
 *
 * 2. spell_tx:
 *    - Last input: ALREADY SIGNED by prover (spends commit_tx output)
 *    - Other inputs: Must be signed by user with Schnorr
 *    - Preserve prover's witness on commit output
 */

"use client";

import { useState, useCallback } from "react";
import {
  useWalletStore,
  useUIStore,
  useMarketsStore,
  usePortfolioStore,
} from "./store";
import { SpellBuilder, createMarketId, createQuestionHash } from "./charms";
import {
  castSpell,
  getExplorerUrl,
  getConfig,
  //broadcastTx,
  type CastResponse,
} from "./charmsApi";
import {
  fetchUTXOs,
  fetchTxHex,
  signProverTransactions,
  broadcastTxPackage,
  type MempoolUTXO,
} from "./bitcoin";
import type { Market } from "@/types";

// =============================================================================
// TYPES
// =============================================================================

interface UseCharmsReturn {
  // State
  isLoading: boolean;
  error: string | null;
  lastTxid: string | null;
  lastExplorerUrl: string | null;

  // Actions
  createMarket: (params: CreateMarketParams) => Promise<string>;
  mintShares: (params: MintSharesParams) => Promise<CastResponse>;
  redeemShares: (params: RedeemSharesParams) => Promise<CastResponse>;
  trade: (params: TradeParams) => Promise<CastResponse>;

  // Helpers
  clearError: () => void;
}

interface CreateMarketParams {
  question: string;
  description?: string;
  tradingDeadline: number;
  resolutionDeadline: number;
  feeBps: number;
  minBet: number;
  maxSupply: number;
}

interface MintSharesParams {
  marketId: string;
  amount: number;
}

interface RedeemSharesParams {
  marketId: string;
  yesTokens: number;
  noTokens: number;
}

interface TradeParams {
  marketId: string;
  // What the user is selling
  sellOutcome: "Yes" | "No";
  sellAmount: number;
  sellUtxoId: string; // User's token UTXO
  // What the user is buying (counterparty's tokens)
  buyUtxoId: string; // Counterparty's token UTXO
  counterpartyAddress: string;
}

// =============================================================================
// HOOK
// =============================================================================

export function useCharms(): UseCharmsReturn {
  const { wallet, mnemonic } = useWalletStore();
  const { addToast, setProcessing } = useUIStore();
  const { addMarket, markets } = useMarketsStore();
  const {
    addTransaction,
    addPosition,
    updatePosition,
    updateTransactionStatus,
  } = usePortfolioStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTxid, setLastTxid] = useState<string | null>(null);
  const [lastExplorerUrl, setLastExplorerUrl] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Poll transaction status until confirmed or max attempts reached
   */
  const pollTxStatus = useCallback(
    async (txid: string, maxAttempts = 30) => {
      const POLL_INTERVAL = 10000; // 10 seconds

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await fetch(
            `https://mempool.space/testnet4/api/tx/${txid}/status`
          );

          if (response.ok) {
            const status = await response.json();

            if (status.confirmed) {
              // Update transaction status in store
              updateTransactionStatus(txid, "confirmed");
              return true;
            }
          }
        } catch (error) {
          console.warn(`Poll attempt ${attempt + 1} failed:`, error);
        }

        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      }

      return false; // Not confirmed within max attempts
    },
    [updateTransactionStatus]
  );

  /**
   * Select best UTXO (prefer confirmed, but allow unconfirmed)
   *
   * From organizers: "it's usually sufficient to have the tx accepted to mempool"
   * You only need block confirmation for block-specific data (timestamp, blockhash)
   */
  const selectBestUtxo = useCallback((utxos: MempoolUTXO[]): MempoolUTXO => {
    if (utxos.length === 0) {
      throw new Error("No UTXOs available. Please fund your wallet first.");
    }

    // Blacklist UTXOs that prover rejected
    const blacklist = [
      "a56180e74364ce3368a86ed25d54efda85fa24300d051b27ecff46d8f3203c2e:1",
    ];

    const available = utxos.filter(
      (u) => !blacklist.includes(`${u.txid}:${u.vout}`)
    );

    if (available.length === 0) {
      throw new Error("No available UTXOs. All were previously used.");
    }

    // Sort: prefer confirmed, then by value descending
    const sorted = [...available].sort((a, b) => {
      if (a.status.confirmed && !b.status.confirmed) return -1;
      if (!a.status.confirmed && b.status.confirmed) return 1;
      return b.value - a.value;
    });

    return sorted[0];
  }, []);

  /**
   * Fetch previous transaction hexes for UTXOs (required by prover)
   */
  const fetchPrevTxs = useCallback(
    async (utxos: MempoolUTXO[]): Promise<string[]> => {
      const uniqueTxids = [...new Set(utxos.map((u) => u.txid))];
      const hexes = await Promise.all(
        uniqueTxids.map(async (txid) => {
          try {
            return await fetchTxHex(txid);
          } catch {
            console.warn(`Failed to fetch tx ${txid}`);
            return "";
          }
        })
      );
      return hexes.filter((h) => h.length > 0);
    },
    []
  );

  /**
   * Sign and broadcast prover transactions
   *
   * Flow:
   * 1. Fetch mining tx hex (contains funding UTXO)
   * 2. Sign commit_tx (fully signed by user)
   * 3. Sign spell_tx (all inputs except last, which is pre-signed by prover)
   * 4. Broadcast both transactions
   */
  const signAndBroadcast = useCallback(
    async (
      commitTxHex: string | { bitcoin?: string; hex?: string },
      spellTxHex: string | { bitcoin?: string; hex?: string },
      fundingUtxo: MempoolUTXO
    ): Promise<{ commitTxid: string; spellTxid: string }> => {
      // Extract hex string if object
      const commitHex =
        typeof commitTxHex === "string"
          ? commitTxHex
          : commitTxHex.bitcoin || commitTxHex.hex || "";
      const spellHex =
        typeof spellTxHex === "string"
          ? spellTxHex
          : spellTxHex.bitcoin || spellTxHex.hex || "";

      if (!commitHex || !spellHex) {
        throw new Error("Invalid transaction format from prover");
      }
      if (!mnemonic) {
        throw new Error(
          "Wallet mnemonic not available. Please reconnect wallet."
        );
      }

      setProcessing(true, "Fetching transaction data...");

      // Fetch the mining tx (the tx that contains our funding UTXO)
      const miningTxHex = await fetchTxHex(fundingUtxo.txid);
      if (!miningTxHex) {
        throw new Error("Failed to fetch funding transaction");
      }

      setProcessing(true, "Signing transactions...");

      // Sign both transactions using Taproot/Schnorr
      const { signedCommitTx, signedSpellTx /*commitTxid, spellTxid*/ } =
        await signProverTransactions(
          commitHex,
          spellHex,
          miningTxHex,
          mnemonic,
          true // isTestnet
        );

      setProcessing(true, "Broadcasting transactions...");

      // Broadcast both transactions
      const broadcastResult = await broadcastTxPackage(
        signedCommitTx,
        signedSpellTx
      );

      setProcessing(false);

      return broadcastResult;
    },
    [mnemonic, setProcessing]
  );

  /**
   * Create a new prediction market
   */
  const createMarket = useCallback(
    async (params: CreateMarketParams): Promise<string> => {
      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      if (!mnemonic) {
        throw new Error("Wallet mnemonic not available");
      }

      setIsLoading(true);
      setError(null);

      try {
        setProcessing(true, "Fetching UTXOs...");

        // Fetch UTXOs for funding
        const utxos = await fetchUTXOs(wallet.address);
        const fundingUtxo = selectBestUtxo(utxos);
        const fundingUtxoId = `${fundingUtxo.txid}:${fundingUtxo.vout}`;

        // Fetch previous tx hexes (required by prover)
        const prevTxs = await fetchPrevTxs([fundingUtxo]);

        // Generate IDs
        const marketId = await createMarketId(fundingUtxoId);
        const questionHash = await createQuestionHash(params.question);

        setProcessing(true, "Building spell...");

        // Get APP_VK from server if not available on client
        let appVk = process.env.NEXT_PUBLIC_APP_VK || "";
        if (!appVk) {
          try {
            const config = await getConfig();
            appVk = config.appVk;
          } catch (err) {
            console.warn("Failed to fetch APP_VK from server:", err);
          }
        }

        // Build spell
        const builder = new SpellBuilder(marketId, appVk);
        const spell = builder.buildCreateSpell({
          fundingUtxo: fundingUtxoId,
          questionHash,
          tradingDeadline: params.tradingDeadline,
          resolutionDeadline: params.resolutionDeadline,
          feeBps: params.feeBps,
          minBet: params.minBet,
          maxSupply: params.maxSupply,
          creatorPubkey: wallet.publicKey,
          outputAddress: wallet.address,
        });

        console.log("Casting create market spell...", {
          spell: {
            version: spell.version,
            apps: spell.apps,
            hasPrivateInputs: !!spell.privateInputs,
            hasPublicInputs: !!spell.publicInputs,
            insCount: spell.ins?.length || 0,
            outsCount: spell.outs?.length || 0,
          },
          fundingUtxo: fundingUtxoId,
          fundingUtxoValue: fundingUtxo.value,
          prevTxsCount: prevTxs.length,
        });

        setProcessing(true, "Requesting proof from prover...");

        // Step 1: Get unsigned transactions from prover
        const proverResult = await castSpell({
          spell,
          prevTxs,
          fundingUtxo: fundingUtxoId,
          fundingUtxoValue: fundingUtxo.value,
          changeAddress: wallet.address,
          feeRate: 2.0,
          chain: "bitcoin",
          broadcast: false, // Don't broadcast yet - we need to sign
        });

        if (
          !proverResult.success ||
          !proverResult.commit_tx ||
          !proverResult.spell_tx
        ) {
          throw new Error(
            proverResult.error || "Prover failed to return transactions"
          );
        }

        console.log("Got unsigned transactions from prover, signing...");

        // Step 2 & 3: Sign and broadcast
        const { commitTxid, spellTxid } = await signAndBroadcast(
          proverResult.commit_tx,
          proverResult.spell_tx,
          fundingUtxo
        );

        console.log("Transactions broadcast:", { commitTxid, spellTxid });

        // Add market to local state
        const newMarket: Market = {
          id: marketId.slice(0, 16),
          questionHash,
          question: params.question,
          description: params.description,
          params: {
            tradingDeadline: params.tradingDeadline,
            resolutionDeadline: params.resolutionDeadline,
            feeBps: params.feeBps,
            minBet: params.minBet,
          },
          status: "Active",
          yesSupply: 0,
          noSupply: 0,
          maxSupply: params.maxSupply,
          fees: 0,
          creator: wallet.publicKey,
          createdAt: Math.floor(Date.now() / 1000),
          yesPrice: 50,
          noPrice: 50,
          volume: 0,
          liquidity: 0,
        };

        addMarket(newMarket);

        // Record transaction
        addTransaction({
          txid: spellTxid,
          hex: proverResult.spell_tx,
          status: "pending",
          type: "create",
          marketId: newMarket.id,
          timestamp: Date.now(),
        });

        setLastTxid(spellTxid);
        setLastExplorerUrl(getExplorerUrl(spellTxid));

        addToast({
          type: "success",
          title: "Market Created!",
          message: `TX: ${spellTxid.slice(0, 12)}...`,
        });

        // Start polling for confirmation (non-blocking)
        pollTxStatus(spellTxid).then((confirmed) => {
          if (confirmed) {
            addToast({
              type: "success",
              title: "Transaction Confirmed",
              message: `TX ${spellTxid.slice(0, 8)}... confirmed on-chain`,
            });
          }
        });

        // Return the market ID (sliced to 16 chars as used in the market object)
        return marketId.slice(0, 16);
      } catch (err) {
        let message = "Failed to create market";

        if (err instanceof Error) {
          message = err.message;
          // Check if it's a CharmsApiError with details
          if ("data" in err && err.data && typeof err.data === "object") {
            const data = err.data as { details?: string; error?: string };
            if (data.details) {
              message = `${message}: ${data.details}`;
            } else if (data.error) {
              message = `${message}: ${data.error}`;
            }
          }
        }

        console.error("Create market error:", err);
        setError(message);
        addToast({ type: "error", title: "Error", message });
        throw err;
      } finally {
        setIsLoading(false);
        setProcessing(false);
      }
    },
    [
      wallet,
      mnemonic,
      addMarket,
      addTransaction,
      pollTxStatus,
      addToast,
      selectBestUtxo,
      fetchPrevTxs,
      signAndBroadcast,
      setProcessing,
    ]
  );

  /**
   * Mint YES + NO shares
   */
  const mintShares = useCallback(
    async (params: MintSharesParams): Promise<CastResponse> => {
      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      if (!mnemonic) {
        throw new Error("Wallet mnemonic not available");
      }

      setIsLoading(true);
      setError(null);

      try {
        const market = markets.find((m) => m.id === params.marketId);
        if (!market) {
          throw new Error("Market not found");
        }

        setProcessing(true, "Fetching UTXOs...");

        // Fetch UTXOs
        const utxos = await fetchUTXOs(wallet.address);
        const fundingUtxo = selectBestUtxo(utxos);
        const fundingUtxoId = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
        const prevTxs = await fetchPrevTxs([fundingUtxo]);

        setProcessing(true, "Building mint spell...");

        // Build mint spell
        const builder = new SpellBuilder(market.id);
        const spell = builder.buildMintSpell({
          marketUtxoId: fundingUtxoId,
          userBtcUtxo: fundingUtxoId,
          currentState: {
            questionHash: market.questionHash,
            tradingDeadline: market.params.tradingDeadline,
            resolutionDeadline: market.params.resolutionDeadline,
            feeBps: market.params.feeBps,
            minBet: market.params.minBet,
            maxSupply: market.maxSupply,
            oldYesSupply: market.yesSupply,
            oldNoSupply: market.noSupply,
            oldFees: market.fees,
            creatorPubkey: market.creator,
          },
          mintAmount: params.amount,
          currentTimestamp: Math.floor(Date.now() / 1000),
          marketAddress: wallet.address,
          userAddress: wallet.address,
        });

        console.log("Casting mint shares spell...", spell);

        setProcessing(true, "Requesting proof...");

        // Get unsigned transactions
        const proverResult = await castSpell({
          spell,
          prevTxs,
          fundingUtxo: fundingUtxoId,
          fundingUtxoValue: fundingUtxo.value,
          changeAddress: wallet.address,
          feeRate: 2.0,
          chain: "bitcoin",
          broadcast: false,
        });

        if (
          !proverResult.success ||
          !proverResult.commit_tx ||
          !proverResult.spell_tx
        ) {
          throw new Error(proverResult.error || "Prover failed");
        }

        // Sign and broadcast
        const { commitTxid, spellTxid } = await signAndBroadcast(
          proverResult.commit_tx,
          proverResult.spell_tx,
          fundingUtxo
        );

        // Calculate shares received (mintShares gives equal YES and NO tokens)
        const fee = Math.floor((params.amount * market.params.feeBps) / 10000);
        const sharesReceived = params.amount - fee;

        addTransaction({
          txid: spellTxid,
          hex: proverResult.spell_tx,
          status: "pending",
          type: "mint",
          marketId: params.marketId,
          amount: params.amount,
          timestamp: Date.now(),
        });

        // Update position in portfolio store
        // Check if position already exists
        const existingPosition = usePortfolioStore
          .getState()
          .positions.find((p) => p.marketId === params.marketId);

        if (existingPosition) {
          // Update existing position: accumulate shares and recalculate average cost
          const totalYesTokens = existingPosition.yesTokens + sharesReceived;
          const totalNoTokens = existingPosition.noTokens + sharesReceived;

          // Calculate weighted average cost
          const totalYesCost =
            existingPosition.avgYesCost * existingPosition.yesTokens;
          const newYesCost = market.yesPrice * sharesReceived;
          const avgYesCost =
            totalYesTokens > 0
              ? Math.round((totalYesCost + newYesCost) / totalYesTokens)
              : market.yesPrice;

          const totalNoCost =
            existingPosition.avgNoCost * existingPosition.noTokens;
          const newNoCost = market.noPrice * sharesReceived;
          const avgNoCost =
            totalNoTokens > 0
              ? Math.round((totalNoCost + newNoCost) / totalNoTokens)
              : market.noPrice;

          updatePosition(params.marketId, {
            yesTokens: totalYesTokens,
            noTokens: totalNoTokens,
            avgYesCost,
            avgNoCost,
          });
        } else {
          // Add new position
          addPosition({
            marketId: params.marketId,
            yesTokens: sharesReceived,
            noTokens: sharesReceived,
            avgYesCost: market.yesPrice,
            avgNoCost: market.noPrice,
          });
        }

        setLastTxid(spellTxid);
        setLastExplorerUrl(getExplorerUrl(spellTxid));

        addToast({
          type: "success",
          title: "Shares Minted!",
          message: `${sharesReceived.toLocaleString()} YES + NO tokens`,
        });

        // Start polling for confirmation (non-blocking)
        pollTxStatus(spellTxid).then((confirmed) => {
          if (confirmed) {
            addToast({
              type: "success",
              title: "Transaction Confirmed",
              message: `TX ${spellTxid.slice(0, 8)}... confirmed on-chain`,
            });
          }
        });

        return {
          ...proverResult,
          txid: spellTxid,
          commitTxid,
          spellTxid,
          explorerUrl: getExplorerUrl(spellTxid),
          broadcast: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to mint";
        setError(message);
        addToast({ type: "error", title: "Error", message });
        throw err;
      } finally {
        setIsLoading(false);
        setProcessing(false);
      }
    },
    [
      wallet,
      mnemonic,
      markets,
      addTransaction,
      addPosition,
      updatePosition,
      pollTxStatus,
      addToast,
      selectBestUtxo,
      fetchPrevTxs,
      signAndBroadcast,
      setProcessing,
    ]
  );

  /**
   * Redeem winning shares
   */
  const redeemShares = useCallback(
    async (params: RedeemSharesParams): Promise<CastResponse> => {
      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      if (!mnemonic) {
        throw new Error("Wallet mnemonic not available");
      }

      setIsLoading(true);
      setError(null);

      try {
        const market = markets.find((m) => m.id === params.marketId);
        if (!market) {
          throw new Error("Market not found");
        }

        if (market.status !== "Resolved") {
          throw new Error("Market not yet resolved");
        }

        setProcessing(true, "Fetching UTXOs...");

        const utxos = await fetchUTXOs(wallet.address);
        const fundingUtxo = selectBestUtxo(utxos);
        const fundingUtxoId = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
        const prevTxs = await fetchPrevTxs([fundingUtxo]);

        setProcessing(true, "Building redeem spell...");

        // Build redeem spell
        const builder = new SpellBuilder(market.id);
        const spell = builder.buildRedeemSpell({
          marketUtxoId: fundingUtxoId,
          userTokensUtxo: fundingUtxoId,
          marketState: {},
          yesTokensBurned: params.yesTokens,
          noTokensBurned: params.noTokens,
          marketAddress: wallet.address,
          userAddress: wallet.address,
        });

        console.log("Casting redeem spell...", spell);

        setProcessing(true, "Requesting proof...");

        // Get unsigned transactions
        const proverResult = await castSpell({
          spell,
          prevTxs,
          fundingUtxo: fundingUtxoId,
          fundingUtxoValue: fundingUtxo.value,
          changeAddress: wallet.address,
          feeRate: 2.0,
          chain: "bitcoin",
          broadcast: false,
        });

        if (
          !proverResult.success ||
          !proverResult.commit_tx ||
          !proverResult.spell_tx
        ) {
          throw new Error(proverResult.error || "Prover failed");
        }

        // Sign and broadcast
        const { commitTxid, spellTxid } = await signAndBroadcast(
          proverResult.commit_tx,
          proverResult.spell_tx,
          fundingUtxo
        );

        const payout = params.yesTokens + params.noTokens;

        addTransaction({
          txid: spellTxid,
          hex: proverResult.spell_tx,
          status: "pending",
          type: "redeem",
          marketId: params.marketId,
          amount: payout,
          timestamp: Date.now(),
        });

        setLastTxid(spellTxid);
        setLastExplorerUrl(getExplorerUrl(spellTxid));

        addToast({
          type: "success",
          title: "Shares Redeemed!",
          message: `Received ${payout.toLocaleString()} sats`,
        });

        // Start polling for confirmation (non-blocking)
        pollTxStatus(spellTxid).then((confirmed) => {
          if (confirmed) {
            addToast({
              type: "success",
              title: "Transaction Confirmed",
              message: `TX ${spellTxid.slice(0, 8)}... confirmed on-chain`,
            });
          }
        });

        return {
          ...proverResult,
          txid: spellTxid,
          commitTxid,
          spellTxid,
          explorerUrl: getExplorerUrl(spellTxid),
          broadcast: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to redeem";
        setError(message);
        addToast({ type: "error", title: "Error", message });
        throw err;
      } finally {
        setIsLoading(false);
        setProcessing(false);
      }
    },
    [
      wallet,
      mnemonic,
      markets,
      addTransaction,
      pollTxStatus,
      addToast,
      selectBestUtxo,
      fetchPrevTxs,
      signAndBroadcast,
      setProcessing,
    ]
  );

  /**
   * Trade tokens P2P (swap YES for NO or vice versa)
   */
  const trade = useCallback(
    async (params: TradeParams): Promise<CastResponse> => {
      if (!wallet) throw new Error("Wallet not connected");
      if (!mnemonic) throw new Error("Wallet mnemonic not available");

      setIsLoading(true);
      setError(null);

      try {
        const market = markets.find((m) => m.id === params.marketId);
        if (!market) throw new Error("Market not found");

        setProcessing(true, "Fetching UTXOs...");

        const utxos = await fetchUTXOs(wallet.address);
        const fundingUtxo = selectBestUtxo(utxos);
        const fundingUtxoId = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
        const prevTxs = await fetchPrevTxs([fundingUtxo]);

        setProcessing(true, "Building trade spell...");

        // Build trade spell using SpellBuilder
        const builder = new SpellBuilder(market.id);
        const spell = builder.buildTradeSpell({
          // User's input (what they're selling)
          userTokenUtxo: params.sellUtxoId,
          userSellAmount: params.sellAmount,
          userSellOutcome: params.sellOutcome,
          // Counterparty's input (what user is buying)
          counterpartyTokenUtxo: params.buyUtxoId,
          counterpartyAmount: params.sellAmount, // Equal swap
          counterpartyOutcome: params.sellOutcome === "Yes" ? "No" : "Yes",
          // Output addresses
          userAddress: wallet.address,
          counterpartyAddress: params.counterpartyAddress,
        });

        console.log("Casting trade spell...", spell);

        setProcessing(true, "Requesting proof...");

        const proverResult = await castSpell({
          spell,
          prevTxs,
          fundingUtxo: fundingUtxoId,
          fundingUtxoValue: fundingUtxo.value,
          changeAddress: wallet.address,
          feeRate: 2.0,
          chain: "bitcoin",
          broadcast: false,
        });

        if (
          !proverResult.success ||
          !proverResult.commit_tx ||
          !proverResult.spell_tx
        ) {
          throw new Error(proverResult.error || "Prover failed");
        }

        const { commitTxid, spellTxid } = await signAndBroadcast(
          proverResult.commit_tx,
          proverResult.spell_tx,
          fundingUtxo
        );

        // Update position: remove sold tokens, add bought tokens
        const existingPosition = usePortfolioStore
          .getState()
          .positions.find((p) => p.marketId === params.marketId);

        if (existingPosition) {
          const isSellYes = params.sellOutcome === "Yes";
          updatePosition(params.marketId, {
            yesTokens: isSellYes
              ? existingPosition.yesTokens - params.sellAmount
              : existingPosition.yesTokens + params.sellAmount,
            noTokens: isSellYes
              ? existingPosition.noTokens + params.sellAmount
              : existingPosition.noTokens - params.sellAmount,
          });
        }

        addTransaction({
          txid: spellTxid,
          hex: proverResult.spell_tx,
          status: "pending",
          type: "trade",
          marketId: params.marketId,
          amount: params.sellAmount,
          timestamp: Date.now(),
        });

        setLastTxid(spellTxid);
        setLastExplorerUrl(getExplorerUrl(spellTxid));

        // Start polling for confirmation
        pollTxStatus(spellTxid).then((confirmed) => {
          if (confirmed) {
            addToast({
              type: "success",
              title: "Trade Confirmed",
              message: `TX ${spellTxid.slice(0, 8)}... confirmed on-chain`,
            });
          }
        });

        addToast({
          type: "success",
          title: "Trade Submitted!",
          message: `Swapped ${params.sellAmount} ${params.sellOutcome} tokens`,
        });

        return {
          ...proverResult,
          txid: spellTxid,
          commitTxid,
          spellTxid,
          explorerUrl: getExplorerUrl(spellTxid),
          broadcast: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to trade";
        setError(message);
        addToast({ type: "error", title: "Error", message });
        throw err;
      } finally {
        setIsLoading(false);
        setProcessing(false);
      }
    },
    [
      wallet,
      mnemonic,
      markets,
      addTransaction,
      updatePosition,
      pollTxStatus,
      addToast,
      selectBestUtxo,
      fetchPrevTxs,
      signAndBroadcast,
      setProcessing,
    ]
  );

  return {
    isLoading,
    error,
    lastTxid,
    lastExplorerUrl,
    createMarket,
    mintShares,
    redeemShares,
    trade,
    clearError,
  };
}
