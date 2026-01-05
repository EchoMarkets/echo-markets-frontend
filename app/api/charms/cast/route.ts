/**
 * API Route: POST /api/charms/cast
 *
 * All-in-one spell casting: prove via Charms v8 API, sign, then broadcast.
 *
 * Transaction Structure (from organizers):
 *
 * 1. commit_tx:
 *    - Spends exactly 1 input (funding UTXO)
 *    - Creates exactly 1 output (to be spent by spell_tx)
 *    - Must be signed by user's wallet
 *
 * 2. spell_tx:
 *    - Last input: ALREADY SIGNED by prover (spends commit_tx output)
 *    - Other inputs: Must be signed by user's wallet
 *    - Contains the ZK proof in witness/OP_RETURN
 *
 * Signing Flow:
 * 1. Prover returns [commit_tx, spell_tx] - partially signed
 * 2. User signs commit_tx (single input)
 * 3. User signs spell_tx's other inputs (NOT the last one)
 * 4. Broadcast commit_tx, then spell_tx
 *
 * Note: Use SegWit/Taproot for inputs - simpler and cheaper witness handling
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

// Configuration
const PROVER_API =
  process.env.CHARMS_PROVER_URL || "https://v8.charms.dev/spells/prove";
const MEMPOOL_API =
  process.env.MEMPOOL_API || "https://mempool.space/testnet4/api";
const APP_WASM_PATH =
  process.env.APP_WASM_PATH || "./contracts/echo_markets.wasm";
const APP_VK = process.env.APP_VK || "";
const PROVE_TIMEOUT = 300000; // 5 minutes

export async function POST(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);

  console.log(`[${requestId}] Starting cast request`);

  try {
    const body = await request.json();
    const {
      spell,
      prevTxs = [],
      fundingUtxo,
      fundingUtxoValue,
      changeAddress,
      feeRate = 2.0,
      chain = "bitcoin",
      binaries,
      broadcast = true,
      // For signing (if provided)
      signedCommitTx, // Pre-signed commit tx (if user signed client-side)
      signedSpellTx, // Pre-signed spell tx (if user signed client-side)
    } = body;

    if (!spell) {
      return NextResponse.json(
        { error: "Missing spell data" },
        { status: 400 }
      );
    }

    if (!fundingUtxo || !fundingUtxoValue || !changeAddress) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: fundingUtxo, fundingUtxoValue, changeAddress",
        },
        { status: 400 }
      );
    }

    // Load app binaries
    let appBinaries: Record<string, string> = {};

    if (binaries) {
      appBinaries = binaries;
      console.log(
        `[${requestId}] Using provided binaries for ${
          Object.keys(appBinaries).length
        } app(s)`
      );
    } else if (existsSync(APP_WASM_PATH)) {
      const wasmBytes = await readFile(APP_WASM_PATH);
      const wasmBase64 = wasmBytes.toString("base64");

      // Use configured VK or extract from spell
      if (APP_VK) {
        appBinaries[APP_VK] = wasmBase64;
        console.log(
          `[${requestId}] Loaded WASM for VK: ${APP_VK.slice(0, 16)}...`
        );
      } else if (spell.apps) {
        // Extract VK from spell apps (format: "n/marketId/vk" or "t/tokenId/vk")
        for (const [, appValue] of Object.entries(spell.apps)) {
          if (typeof appValue === "string") {
            const parts = appValue.split("/");
            if (parts.length >= 3) {
              const vk = parts[parts.length - 1];
              if (vk && vk.length > 0) {
                appBinaries[vk] = wasmBase64;
              }
            }
          }
        }
        console.log(
          `[${requestId}] Loaded WASM for ${
            Object.keys(appBinaries).length
          } app(s) extracted from spell`
        );
      } else {
        console.warn(
          `[${requestId}] No APP_VK configured and could not extract from spell.apps`
        );
      }
    } else {
      console.warn(
        `[${requestId}] WASM file not found at ${APP_WASM_PATH} and no binaries provided`
      );
    }

    // Validate that we have binaries if spell has apps
    if (
      spell.apps &&
      Object.keys(spell.apps).length > 0 &&
      Object.keys(appBinaries).length === 0
    ) {
      console.error(
        `[${requestId}] Warning: Spell has apps but no binaries loaded`
      );
    }

    // =========================================================================
    // Step 1: Call Charms Prover API
    // =========================================================================
    console.log(`[${requestId}] Calling prover at ${PROVER_API}...`);

    // Format prev_txs: prover expects array of objects with chain field
    // Format: [{ bitcoin: "..." }] or [{ cardano: "..." }]
    const formattedPrevTxs = prevTxs.map((txHex: string) => {
      // Use lowercase chain name as key
      return { [chain]: txHex };
    });

    // Convert spell to snake_case for Rust API
    const formattedSpell = {
      version: spell.version,
      apps: spell.apps,
      // Convert camelCase to snake_case (support both for flexibility)
      private_inputs: spell.privateInputs || spell.private_inputs || undefined,
      public_inputs: spell.publicInputs || spell.public_inputs || undefined,
      ins: spell.ins?.map(
        (input: {
          utxoId?: string;
          utxo_id?: string;
          charms: Record<string, unknown>;
        }) => ({
          utxo_id: input.utxoId || input.utxo_id,
          charms: input.charms,
        })
      ),
      outs: spell.outs,
    };

    // Remove undefined fields (prover may reject null/undefined)
    if (!formattedSpell.private_inputs) delete formattedSpell.private_inputs;
    if (!formattedSpell.public_inputs) delete formattedSpell.public_inputs;

    // Log full spell structure for debugging WASM errors
    console.log(
      `[${requestId}] Full spell structure:`,
      JSON.stringify(formattedSpell, null, 2)
    );

    // Build ProveRequest matching Charms Rust struct
    const proverRequest = {
      spell: formattedSpell,
      binaries: appBinaries,
      prev_txs: formattedPrevTxs,
      funding_utxo: fundingUtxo,
      funding_utxo_value: fundingUtxoValue,
      change_address: changeAddress,
      fee_rate: feeRate,
      chain,
      collateral_utxo: null,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVE_TIMEOUT);

    let txs: string[];

    try {
      const proverResponse = await fetch(PROVER_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proverRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!proverResponse.ok) {
        // Read response as text first (can only read body once)
        const errorText = await proverResponse.text();
        let errorDetails: string = errorText;

        // Try to parse as JSON for better error message
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails =
            typeof errorJson === "string"
              ? errorJson
              : errorJson.error ||
                errorJson.message ||
                errorJson.details ||
                JSON.stringify(errorJson);
        } catch {
          // Not JSON, use text as-is
          errorDetails = errorText;
        }

        console.error(
          `[${requestId}] Prover error (${proverResponse.status}):`,
          errorDetails
        );
        console.error(
          `[${requestId}] Request sent:`,
          JSON.stringify(
            {
              spell: {
                version: spell.version,
                apps: spell.apps,
                hasPrivateInputs: !!spell.privateInputs,
                hasPublicInputs: !!spell.publicInputs,
                insCount: spell.ins?.length || 0,
                outsCount: spell.outs?.length || 0,
              },
              binariesCount: Object.keys(appBinaries).length,
              prevTxsCount: prevTxs.length,
              fundingUtxo,
              fundingUtxoValue,
            },
            null,
            2
          )
        );

        return NextResponse.json(
          {
            error: "Prover API error",
            details: errorDetails,
            status: proverResponse.status,
            requestId,
          },
          { status: proverResponse.status }
        );
      }

      // Response is Vec<Tx> - array of transaction hexes
      // [0] = commit_tx (needs full signing)
      // [1] = spell_tx (last input pre-signed by prover)
      txs = await proverResponse.json();
      console.log(
        `[${requestId}] Prover returned ${txs.length} transaction(s)`
      );
    } finally {
      clearTimeout(timeout);
    }

    // Extract transactions
    const commitTxHex = txs[0] || null;
    const spellTxHex = txs[1] || txs[0] || null;

    if (!spellTxHex) {
      return NextResponse.json(
        {
          error: "Prover returned no transactions",
          requestId,
        },
        { status: 500 }
      );
    }

    // =========================================================================
    // Step 2: Sign transactions (if not pre-signed)
    // =========================================================================
    //
    // The prover returns PARTIALLY SIGNED transactions:
    // - commit_tx: UNSIGNED - user must sign the single input
    // - spell_tx: PARTIALLY SIGNED - last input signed by prover,
    //             other inputs must be signed by user
    //
    // For now, we return the unsigned txs for client-side signing.
    // In production, you'd sign here with the user's key.
    //
    // Use the pre-signed versions if provided
    const finalCommitTx = signedCommitTx || commitTxHex;
    const finalSpellTx = signedSpellTx || spellTxHex;

    // =========================================================================
    // Step 3: Broadcast transactions (if requested and signed)
    // =========================================================================
    let commitTxid: string | null = null;
    let spellTxid: string | null = null;

    if (broadcast) {
      // Check if transactions appear to be signed
      // (This is a simple heuristic - real check would parse the tx)
      const isCommitSigned = signedCommitTx || false;
      const isSpellSigned = signedSpellTx || false;

      if (!isCommitSigned && !isSpellSigned) {
        // Return unsigned transactions for client-side signing
        console.log(
          `[${requestId}] Returning unsigned transactions for signing`
        );

        return NextResponse.json({
          success: true,
          requestId,
          transactions: txs,
          commit_tx: commitTxHex,
          spell_tx: spellTxHex,
          needsSignature: true,
          signingInfo: {
            commit_tx: {
              description: "Sign the single input (funding UTXO)",
              inputsToSign: [0],
            },
            spell_tx: {
              description:
                "Sign all inputs EXCEPT the last one (already signed by prover)",
              inputsToSign: "all except last",
              lastInputPreSigned: true,
            },
          },
          broadcast: false,
        });
      }

      // Broadcast commit tx first
      if (finalCommitTx && finalCommitTx !== finalSpellTx) {
        console.log(`[${requestId}] Broadcasting commit tx...`);
        commitTxid = await broadcastTx(finalCommitTx);
        console.log(`[${requestId}] Commit txid: ${commitTxid}`);
      }

      // Broadcast spell tx
      console.log(`[${requestId}] Broadcasting spell tx...`);
      spellTxid = await broadcastTx(finalSpellTx);
      console.log(`[${requestId}] Spell txid: ${spellTxid}`);
    }

    return NextResponse.json({
      success: true,
      requestId,
      transactions: txs,
      commit_tx: commitTxHex,
      spell_tx: spellTxHex,
      commitTxid,
      spellTxid,
      txid: spellTxid,
      explorerUrl: spellTxid
        ? `https://mempool.space/testnet4/tx/${spellTxid}`
        : null,
      broadcast: !!spellTxid,
      needsSignature: !spellTxid,
    });
  } catch (error) {
    console.error(`[${requestId}] Cast error:`, error);

    const message = error instanceof Error ? error.message : "Unknown error";

    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Prover timeout", requestId },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Cast failed",
        details: message,
        requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * Broadcast transaction to mempool.space
 */
async function broadcastTx(txHex: string): Promise<string> {
  const response = await fetch(`${MEMPOOL_API}/tx`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: txHex,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Broadcast failed: ${error}`);
  }

  return response.text(); // Returns txid
}
