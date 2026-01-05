/**
 * API Route: POST /api/charms/prove
 *
 * Proves a spell using the Charms v8 Prover API.
 *
 * Based on ProveRequest from src/spell.rs#L694:
 * ```rust
 * pub struct ProveRequest {
 *     pub spell: Spell,
 *     pub binaries: BTreeMap<B32, Vec<u8>>,  // VK hash -> WASM (base64 in JSON)
 *     pub prev_txs: Vec<Tx>,                 // Previous transaction hexes
 *     pub funding_utxo: UtxoId,              // "txid:vout"
 *     pub funding_utxo_value: u64,           // Value in sats
 *     pub change_address: String,            // Bitcoin address
 *     pub fee_rate: f64,                     // sat/vB
 *     pub chain: Chain,                      // "bitcoin" | "cardano"
 *     pub collateral_utxo: Option<UtxoId>,
 * }
 * ```
 *
 * Response: Vec<Tx> - array of transactions [commit_tx, spell_tx]
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

// Charms v8 Prover API
const PROVER_API =
  process.env.CHARMS_PROVER_URL || "https://v8.charms.dev/spells/prove";

// Path to compiled contract WASM
const APP_WASM_PATH =
  process.env.APP_WASM_PATH || "./contracts/echo_markets.wasm";

// App verification key (get with: charms app vk --wasm ./contract.wasm)
const APP_VK = process.env.APP_VK || "";

// Timeout for proving (5 minutes)
const PROVE_TIMEOUT = 300000;

export async function POST(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);

  console.log(`[${requestId}] Starting prove request to ${PROVER_API}`);

  try {
    // Parse request body
    const body = await request.json();
    const {
      spell, // Spell object
      prevTxs = [], // Array of tx hex strings
      fundingUtxo, // "txid:vout"
      fundingUtxoValue, // sats
      changeAddress, // Bitcoin address
      feeRate = 2.0, // sat/vB
      chain = "bitcoin", // 'bitcoin' or 'cardano'
      binaries, // Optional: { vk: base64_wasm }
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

    // Load app binaries (WASM)
    // Format: { "vk_hash_hex": "base64_wasm_bytes" }
    let appBinaries: Record<string, string> = {};

    if (binaries) {
      // Use provided binaries
      appBinaries = binaries;
    } else if (existsSync(APP_WASM_PATH) && APP_VK) {
      // Read WASM from file and use configured VK
      const wasmBytes = await readFile(APP_WASM_PATH);
      const wasmBase64 = wasmBytes.toString("base64");
      appBinaries[APP_VK] = wasmBase64;
      console.log(
        `[${requestId}] Loaded WASM for VK: ${APP_VK.slice(0, 16)}...`
      );
    } else if (existsSync(APP_WASM_PATH)) {
      // Try to extract VKs from spell and load WASM
      const wasmBytes = await readFile(APP_WASM_PATH);
      const wasmBase64 = wasmBytes.toString("base64");

      // Extract VKs from spell's apps
      if (spell.apps) {
        for (const [, app] of Object.entries(spell.apps) as [
          string,
          { vk?: string }
        ][]) {
          if (app.vk) {
            appBinaries[app.vk] = wasmBase64;
          }
        }
      }

      console.log(
        `[${requestId}] Loaded WASM for ${
          Object.keys(appBinaries).length
        } app(s)`
      );
    }

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

    // Build ProveRequest matching Charms Rust struct
    const proverRequest = {
      spell: formattedSpell, // Spell object with snake_case fields
      binaries: appBinaries, // { vk: base64_wasm }
      prev_txs: formattedPrevTxs, // Array of { bitcoin: "hex" } or { cardano: "hex" }
      funding_utxo: fundingUtxo, // "txid:vout"
      funding_utxo_value: fundingUtxoValue, // u64 sats
      change_address: changeAddress, // Bitcoin address
      fee_rate: feeRate, // f64 sat/vB
      chain, // "bitcoin" or "cardano"
      collateral_utxo: null, // Optional for Cardano
    };

    console.log(`[${requestId}] Calling prover API...`);
    console.log(
      `[${requestId}] Funding UTXO: ${fundingUtxo} (${fundingUtxoValue} sats)`
    );
    console.log(`[${requestId}] Change address: ${changeAddress}`);
    console.log(`[${requestId}] Fee rate: ${feeRate} sat/vB`);

    // Call Charms Prover API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVE_TIMEOUT);

    try {
      const response = await fetch(PROVER_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(proverRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[${requestId}] Prover error (${response.status}):`,
          errorText
        );

        return NextResponse.json(
          {
            error: "Prover API error",
            status: response.status,
            details: errorText,
            requestId,
          },
          { status: response.status }
        );
      }

      // Response is Vec<Tx> - array of transactions
      // Typically [commit_tx, spell_tx]
      const txs: string[] = await response.json();

      console.log(
        `[${requestId}] Prover returned ${txs.length} transaction(s)`
      );

      return NextResponse.json({
        success: true,
        requestId,
        transactions: txs,
        commit_tx: txs[0] || null,
        spell_tx: txs[1] || txs[0] || null,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);

    const message = error instanceof Error ? error.message : "Unknown error";

    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          error: "Prover timeout",
          details: "Proof generation took too long (>5min)",
          requestId,
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Proof generation failed",
        details: message,
        requestId,
      },
      { status: 500 }
    );
  }
}
